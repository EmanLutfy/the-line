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

interface ITheLine {
    function mintNext(address to) external returns (uint256);
    function totalMinted() external view returns (uint256);
    function MAX_SUPPLY() external view returns (uint256);
}

/// @title LineMint
/// @notice Burn $LINE, receive the next work in the collection.
/// @dev There is no randomness anywhere in this contract, and that is the
///      point: ids are handed out strictly in order, so there is no roll to
///      re-run, no result to peek at, and no ordering for anyone to game. What
///      keeps the sale fair is that the artwork behind every id stays hidden
///      until the collection is revealed.
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
    ///         for — the tokens leave circulation either way, but only the
    ///         first path lowers `totalSupply()`.
    bool public useBurnFrom;

    bool public saleOpen;
    bool public configLocked;

    /// @notice 0 means unlimited.
    uint256 public maxPerWallet;
    mapping(address => uint256) public mintedBy;

    error SaleClosed();
    error TokenNotConfigured();
    error PriceNotSet();
    error ConfigIsLocked();
    error WalletLimitReached();
    error BurnFailed();
    error ZeroAddress();

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
    ///      effect of the call is measured rather than assumed. A silently
    ///      no-op `burnFrom`, or a token that skims a fee in transit, fails
    ///      here instead of handing out a free mint.
    ///
    ///      The measurement is taken at the destination, never at the payer.
    ///      Checking that the payer's balance fell by `amount` looks equivalent
    ///      and is not: a fee-on-transfer token takes its cut out of the
    ///      transfer, so the payer loses the full `amount` while the burn
    ///      address receives less and the difference lands in a live fee
    ///      wallet. What has to be proven is that the tokens left circulation,
    ///      which only the sink can show.
    function _burnFrom(IERC20 token, address from, uint256 amount) private {
        if (useBurnFrom) {
            // A real burn lowers total supply by exactly the amount.
            uint256 supplyBefore = token.totalSupply();
            IBurnableERC20(address(token)).burnFrom(from, amount);
            uint256 supplyAfter = token.totalSupply();
            if (supplyAfter > supplyBefore || supplyBefore - supplyAfter != amount) revert BurnFailed();
        } else {
            // No burn entrypoint, so the dead address must receive every unit.
            uint256 deadBefore = token.balanceOf(DEAD);
            token.safeTransferFrom(from, DEAD, amount);
            uint256 deadAfter = token.balanceOf(DEAD);
            if (deadAfter < deadBefore || deadAfter - deadBefore != amount) revert BurnFailed();
        }
    }

    /* ------------------------------------------------------------- admin */

    /// @notice Point the sale at the $LINE contract and set the price. Callable
    ///         until `lockConfig`, because the token does not exist yet.
    function configure(address token_, uint256 price_, bool useBurnFrom_) external onlyOwner {
        if (configLocked) revert ConfigIsLocked();
        if (token_ == address(0)) revert ZeroAddress();
        lineToken = IERC20(token_);
        price = price_;
        useBurnFrom = useBurnFrom_;
        emit Configured(token_, price_, useBurnFrom_);
    }

    /// @notice One-way. After this the token address and the price can never
    ///         move, so nobody has to trust the owner not to raise the cost
    ///         mid-sale.
    function lockConfig() external onlyOwner {
        if (address(lineToken) == address(0)) revert TokenNotConfigured();
        if (price == 0) revert PriceNotSet();
        configLocked = true;
        emit ConfigLocked();
    }

    function setMaxPerWallet(uint256 max_) external onlyOwner {
        if (configLocked) revert ConfigIsLocked();
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

    /* ------------------------------------------------------------- views */

    function remaining() external view returns (uint256) {
        return nft.MAX_SUPPLY() - nft.totalMinted();
    }

    function minted() external view returns (uint256) {
        return nft.totalMinted();
    }
}
