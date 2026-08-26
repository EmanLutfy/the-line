// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title THE LINE
/// @notice 3,333 works. Token ids run 1..3333 and are handed out in order by an
///         external minter contract; this contract never decides who gets what
///         and never touches payment.
/// @dev Deliberately split from the sale logic. The sale mechanism may be
///      replaced later without touching the collection itself, and an auditor
///      reading this file does not have to reason about ERC-20 behaviour.
///
///      There is intentionally no pause on transfers. Pausing an art collection
///      would let the owner freeze what collectors own, which is a power this
///      contract should not have. Minting is paused on the sale contract
///      instead — same effect, without the hostage.
contract TheLine is ERC721, ERC2981, Ownable2Step {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 3333;

    /// @dev ERC-2981 denominator is 10_000, so 500 is 5% and 1000 is 10%.
    uint96 public constant INITIAL_ROYALTY_BPS = 500;

    /// @notice Hard ceiling on the royalty. Without one, an owner — or whoever
    ///         takes the key later — can set 100% after every other lock is
    ///         pulled and quietly make each token unsellable on any marketplace
    ///         that honours ERC-2981. "Fixed forever" has to include this.
    uint96 public constant MAX_ROYALTY_BPS = 1000;

    /// @dev ERC-4906. Declared rather than inherited: the events and the
    ///      interface id are the entire standard, and marketplaces match on the
    ///      event topic and the ERC-165 id, not on an inheritance chain.
    bytes4 private constant IERC4906_ID = 0x49064906;

    /// @notice Number minted so far. Nothing can burn, so this is also the supply.
    uint256 public totalMinted;

    /// @notice The only address allowed to mint. Set once, then locked forever.
    address public minter;
    bool public minterLocked;

    bool public revealed;
    bool public metadataFrozen;
    string private _unrevealedURI;
    string private _baseTokenURI;
    string private _contractURI;

    /// @notice keccak256 over every image hash in token-id order, fixed at
    ///         deployment. Published before the sale opens, it is what lets
    ///         anyone prove after the reveal that the artwork assigned to each
    ///         id was decided beforehand and never rearranged.
    bytes32 public immutable provenanceHash;

    error NotMinter();
    error SupplyExhausted();
    error MinterAlreadyLocked();
    error MinterNotSet();
    error MinterNotAContract();
    error ZeroAddress();
    error AlreadyRevealed();
    error NotRevealed();
    error MetadataIsFrozen();
    error InvalidBaseURI();
    error RoyaltyTooHigh();
    error RenounceDisabled();

    event MinterSet(address indexed minter);
    event MinterLocked(address indexed minter);
    event Revealed(string uri);
    event BaseURIUpdated(string uri);
    event UnrevealedURIUpdated(string uri);
    event MetadataFrozen();

    /// @dev ERC-7572 specifies this event with no parameters. A parameterised
    ///      version has a different topic, so indexers filtering for the
    ///      standard one never see it and the storefront silently stays stale.
    event ContractURIUpdated();

    /// @dev ERC-4906.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(
        address owner_,
        string memory unrevealedURI_,
        string memory contractURI_,
        bytes32 provenanceHash_
    ) ERC721("The Line", "LINE") Ownable(owner_) {
        _unrevealedURI = unrevealedURI_;
        _contractURI = contractURI_;
        provenanceHash = provenanceHash_;

        // Royalties must be declared at deployment — the ERC-2981 interface
        // cannot be bolted on later. The rate and recipient below are both
        // changeable afterwards, within MAX_ROYALTY_BPS.
        _setDefaultRoyalty(owner_, INITIAL_ROYALTY_BPS);
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    /* ------------------------------------------------------------ minting */

    /// @notice Mint the next id in sequence. Only the minter contract may call.
    /// @dev `totalMinted` is written before `_safeMint`, so the receiver hook
    ///      cannot be used to hand out the same id twice.
    function mintNext(address to) external onlyMinter returns (uint256 tokenId) {
        uint256 minted = totalMinted;
        if (minted >= MAX_SUPPLY) revert SupplyExhausted();
        unchecked {
            tokenId = minted + 1;
        }
        totalMinted = tokenId;
        _safeMint(to, tokenId);
    }

    /* ------------------------------------------------------------- admin */

    function setMinter(address minter_) external onlyOwner {
        if (minterLocked) revert MinterAlreadyLocked();
        if (minter_ == address(0)) revert ZeroAddress();
        minter = minter_;
        emit MinterSet(minter_);
    }

    /// @notice Permanently freeze the minter.
    /// @dev The code check matters: the promise made to holders is that exactly
    ///      one *contract* can ever create a token. Locking an EOA here would
    ///      leave a permanent, unpaid, unlimited mint right while the on-chain
    ///      state looked identical to the honest configuration.
    function lockMinter() external onlyOwner {
        if (minterLocked) revert MinterAlreadyLocked();
        address current = minter;
        if (current == address(0)) revert MinterNotSet();
        if (current.code.length == 0) revert MinterNotAContract();
        minterLocked = true;
        emit MinterLocked(current);
    }

    /// @notice Flip from the shared pre-reveal image to per-token metadata.
    /// @dev Owner-controlled on purpose. A hard `totalMinted == MAX_SUPPLY`
    ///      gate would mean a mint that stalls one short could never be
    ///      revealed by anyone, ever — a permanent brick with no way out.
    ///      The sale contract refuses to mint once this has been called, so
    ///      revealing always closes the mint rather than turning it into a
    ///      menu of known artworks.
    function reveal(string calldata baseURI_) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (metadataFrozen) revert MetadataIsFrozen();
        _requireDirectoryURI(baseURI_);
        revealed = true;
        _baseTokenURI = baseURI_;
        emit Revealed(baseURI_);
        emit BatchMetadataUpdate(1, MAX_SUPPLY);
    }

    /// @notice Correct the base URI. Exists only so a typo in a CID is not
    ///         permanent; `freezeMetadata` is what makes the collection final.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _requireDirectoryURI(baseURI_);
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
        emit BatchMetadataUpdate(1, MAX_SUPPLY);
    }

    function setUnrevealedURI(string calldata unrevealedURI_) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _unrevealedURI = unrevealedURI_;
        emit UnrevealedURIUpdated(unrevealedURI_);
        emit BatchMetadataUpdate(1, MAX_SUPPLY);
    }

    /// @notice Collection-level metadata for marketplaces. Left mutable past
    ///         `freezeMetadata` because it describes the storefront, not the
    ///         artwork.
    function setContractURI(string calldata contractURI_) external onlyOwner {
        _contractURI = contractURI_;
        emit ContractURIUpdated();
    }

    /// @notice One-way. After this no owner, present or future, can change what
    ///         any token points at.
    /// @dev Requires a completed reveal. Freezing first would leave every token
    ///      stranded on the placeholder forever: `reveal` would revert on the
    ///      freeze, and so would every setter — the exact permanent brick this
    ///      contract refuses to build anywhere else.
    function freezeMetadata() external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        if (!revealed) revert NotRevealed();
        metadataFrozen = true;
        emit MetadataFrozen();
        emit BatchMetadataUpdate(1, MAX_SUPPLY);
    }

    /// @notice Change the secondary-sale royalty. `feeNumerator` is in
    ///         hundredths of a percent: 500 = 5%, 0 = none.
    /// @dev There is deliberately no `deleteDefaultRoyalty`. Deleting leaves a
    ///      contract that still advertises ERC-2981 but returns a zero
    ///      receiver, which reverts for any marketplace that pays out in a
    ///      token rejecting transfers to address(0). Pass a real address with
    ///      a zero rate instead.
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        if (feeNumerator > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    /// @dev Disabled. Several states here are only recoverable by the owner —
    ///      an unset minter, an unrevealed collection — and renouncing in any
    ///      of them is unrecoverable for everyone. There is no upside to
    ///      keeping a function whose every use is either a no-op or a disaster.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /* ------------------------------------------------------------- views */

    /// @dev Not IERC721Enumerable — just the number marketplaces ask for.
    function totalSupply() external view returns (uint256) {
        return totalMinted;
    }

    /// @notice Every unrevealed token returns the same URI on purpose: until
    ///         the reveal, no id carries any information about its artwork,
    ///         which is what keeps an in-order sale fair.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed) return _unrevealedURI;
        return string.concat(_baseTokenURI, tokenId.toString(), ".json");
    }

    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    function unrevealedURI() external view returns (string memory) {
        return _unrevealedURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return interfaceId == IERC4906_ID || super.supportsInterface(interfaceId);
    }

    /* ----------------------------------------------------------- private */

    /// @dev `tokenURI` is baseURI + id + ".json", so the base must be a
    ///      directory. Without the trailing slash every token resolves to
    ///      something like ".../metadata1.json" — a URL that looks plausible
    ///      and 404s for all 3,333.
    function _requireDirectoryURI(string calldata value) private pure {
        bytes calldata raw = bytes(value);
        if (raw.length == 0 || raw[raw.length - 1] != bytes1("/")) revert InvalidBaseURI();
    }
}
