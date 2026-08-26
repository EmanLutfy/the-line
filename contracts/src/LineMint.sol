// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBurnableERC20 {
    function burnFrom(address account, uint256 amount) external;
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

interface ITheLine {
    function mintNext(address to) external returns (uint256);
    function totalMinted() external view returns (uint256);
    function revealed() external view returns (bool);
    function MAX_SUPPLY() external view returns (uint256);
}

/// @title LineMint
/// @notice Burn $LINE, receive the next work in the collection.
/// @dev There is no randomness anywhere in this contract, and that is the
///      point: ids are handed out strictly in order, so there is no roll to
///      re-run and no result to peek at. What keeps the sale fair is that the
///      artwork behind every id stays hidden until the collection is revealed
///      — which is why `mint` refuses to run once it has been.
///
///      This contract never custodies $LINE. Tokens move straight from the
///      buyer to a burn, never into this address.
contract LineMint is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Used only when $LINE turns out to have no burn entrypoint.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    ITheLine public immutable nft;

    IERC20 public lineToken;
    uint256 public price;

    /// @notice True when $LINE exposes `burnFrom` (a real supply reduction).
    ///         False falls back to sending to an address nobody holds a key
    ///         for. Both are verified at mint time; neither can prove the token
    ///         contract itself is honest.
    bool public useBurnFrom;

    bool public saleOpen;
    bool public configLocked;

    /// @notice 0 means unlimited.
    uint256 public maxPerWallet;
    mapping(address => uint256) public mintedBy;

    error SaleClosed();
    error SaleIsOpen();
    error TokenNotConfigured();
    error PriceNotSet();
    error PriceImplausible();
    error ConfigIsLocked();
    error ConfigNotProven();
    error WalletLimitReached();
    error BurnFailed();
    error CollectionRevealed();
    error ZeroAddress();
    error RenounceDisabled();

    event Configured(address indexed token, uint256 price, bool useBurnFrom);
    event ConfigLocked();
    event SaleOpenSet(bool open);
    event MaxPerWalletSet(uint256 max);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 burned);

    constructor(address owner_, address nft_) Ownable(owner_) {
        if (nft_ == address(0)) revert ZeroAddress();
        nft = ITheLine(nft_);
    }

    /* -------------------------------------------------------------- mint */

    /// @notice Burn `price` $LINE and mint the next token to the caller.
    /// @dev Requires an ERC-20 approval for at least `price` beforehand.
    ///      Order is deliberate: every check runs, then local state is written,
    ///      then the token burn, then the mint. Combined with `nonReentrant`
    ///      that closes the door on a receiver hook re-entering to mint twice
    ///      off one payment.
    function mint() external nonReentrant whenNotPaused returns (uint256 tokenId) {
        if (!saleOpen) revert SaleClosed();

        // Once the artwork is public, an in-order sale stops being a sale.
        // The next id is knowable from `totalMinted()`, so a buyer could read
        // the metadata for it and mint only when the next piece is a good one,
        // leaving the rest permanently unsold. Revealing closes the mint.
        if (nft.revealed()) revert CollectionRevealed();

        IERC20 token = lineToken;
        if (address(token) == address(0)) revert TokenNotConfigured();

        uint256 cost = price;
        if (cost == 0) revert PriceNotSet();

        uint256 limit = maxPerWallet;
        uint256 already = mintedBy[msg.sender];
        if (limit != 0 && already >= limit) revert WalletLimitReached();
        unchecked {
            mintedBy[msg.sender] = already + 1;
        }

        _burnFrom(token, msg.sender, cost);

        // Supply is enforced inside the NFT contract, which reverts past 3,333.
        tokenId = nft.mintNext(msg.sender);
        emit Minted(msg.sender, tokenId, cost);
    }

    /// @dev $LINE will be deployed by a launchpad we do not control, so the
    ///      effect of the call is measured rather than assumed — on both sides.
    ///
    ///      The sink side (supply fell, or the dead address received) is what
    ///      catches a token that skims a fee in transit: the payer loses the
    ///      full amount while the burn address receives less, so a payer-only
    ///      check would wave that through.
    ///
    ///      The payer side is what catches a token whose `burnFrom(account, x)`
    ///      ignores `account` and burns from `msg.sender` instead — a real
    ///      pattern in the wild. Against one of those, a sink-only check passes
    ///      while this contract's own stray balance funds a free mint.
    ///
    ///      Neither proves the token contract is honest. A token can report a
    ///      lower `totalSupply` while crediting the amount somewhere spendable,
    ///      and nothing observable from here can tell the difference. That
    ///      residual is stated in the collection's documentation rather than
    ///      pretended away.
    function _burnFrom(IERC20 token, address from, uint256 amount) private {
        uint256 payerBefore = token.balanceOf(from);

        if (useBurnFrom) {
            uint256 supplyBefore = token.totalSupply();
            IBurnableERC20(address(token)).burnFrom(from, amount);
            uint256 supplyAfter = token.totalSupply();
            if (supplyAfter > supplyBefore || supplyBefore - supplyAfter != amount) revert BurnFailed();
        } else {
            uint256 deadBefore = token.balanceOf(DEAD);
            token.safeTransferFrom(from, DEAD, amount);
            uint256 deadAfter = token.balanceOf(DEAD);
            if (deadAfter < deadBefore || deadAfter - deadBefore != amount) revert BurnFailed();
        }

        uint256 payerAfter = token.balanceOf(from);
        if (payerAfter > payerBefore || payerBefore - payerAfter != amount) revert BurnFailed();
    }

    /* ------------------------------------------------------------- admin */

    /// @notice Point the sale at the $LINE contract and set the price.
    /// @dev Refuses to run while the sale is open. Buyers hold standing
    ///      approvals, and a price change mid-sale would let a pending `mint`
    ///      execute at a number nobody agreed to.
    function configure(address token_, uint256 price_, bool useBurnFrom_) external onlyOwner {
        if (configLocked) revert ConfigIsLocked();
        if (saleOpen) revert SaleIsOpen();
        if (token_ == address(0)) revert ZeroAddress();
        if (price_ == 0) revert PriceNotSet();

        // A units slip is the most expensive typo available here: entering
        // 150000 instead of 150000e18 prices the whole collection at dust and
        // there is no undo once anyone has minted. One whole token is a floor
        // low enough never to block a real configuration and high enough to
        // catch a missing exponent. Tokens without `decimals()` skip the check
        // rather than being locked out.
        try IERC20Decimals(token_).decimals() returns (uint8 decimals) {
            if (decimals > 0 && price_ < 10 ** decimals) revert PriceImplausible();
        } catch {}

        lineToken = IERC20(token_);
        price = price_;
        useBurnFrom = useBurnFrom_;
        emit Configured(token_, price_, useBurnFrom_);
    }

    /// @notice One-way. After this the token address, the price and the burn
    ///         mode can never move.
    /// @dev Requires at least one token to have been minted already. That is
    ///      the only on-chain proof that this exact configuration — this token,
    ///      this price, this burn mode — actually completes a mint. Locking
    ///      before that could freeze a burn path the real $LINE rejects, and
    ///      with the minter locked on the NFT side there would be no way to
    ///      deploy a replacement. The whole collection would be unmintable.
    function lockConfig() external onlyOwner {
        if (configLocked) revert ConfigIsLocked();
        if (address(lineToken) == address(0)) revert TokenNotConfigured();
        if (price == 0) revert PriceNotSet();
        if (nft.totalMinted() == 0) revert ConfigNotProven();
        configLocked = true;
        emit ConfigLocked();
    }

    /// @dev Outside `lockConfig` on purpose. The lock exists so nobody has to
    ///      trust the owner over price; a wallet cap is a distribution control,
    ///      and freezing it low would leave no way to clear the tail of a mint.
    function setMaxPerWallet(uint256 max_) external onlyOwner {
        maxPerWallet = max_;
        emit MaxPerWalletSet(max_);
    }

    /// @dev Stays available after `lockConfig`: opening and closing the sale is
    ///      an operational lever, not an economic one.
    function setSaleOpen(bool open_) external onlyOwner {
        saleOpen = open_;
        emit SaleOpenSet(open_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens sent here by mistake. This contract holds no user
    ///         funds by design — payments go straight from buyer to burn — so
    ///         there is nothing at risk for this to reach.
    function rescueERC20(address token_, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token_).safeTransfer(to, amount);
    }

    /// @dev Disabled. Renouncing while the sale is closed or paused would leave
    ///      no one able to open it, and the NFT's locked minter means no
    ///      replacement sale contract can ever be authorised.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /* ------------------------------------------------------------- views */

    function remaining() external view returns (uint256) {
        return nft.MAX_SUPPLY() - nft.totalMinted();
    }

    function minted() external view returns (uint256) {
        return nft.totalMinted();
    }
}
