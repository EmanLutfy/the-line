// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title THE LINE
/// @notice 3,333 generative works. Token ids run 1..3333 and are handed out in
///         order by an external minter contract; this contract never decides
///         who gets what and never touches payment.
/// @dev Deliberately split from the sale logic. The sale mechanism may be
///      replaced later (a second phase, a different currency) without touching
///      the collection itself, and an auditor reading this file does not have
///      to reason about ERC-20 behaviour at all.
///
///      There is intentionally no pause on transfers. Pausing an art
///      collection would let the owner freeze what collectors own, which is a
///      power this contract should not have. Minting is paused on the sale
///      contract instead — same effect, without the hostage.
contract TheLine is ERC721, ERC2981, Ownable2Step {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 3333;

    /// @dev ERC-2981 denominator is 10_000, so 500 is 5%.
    uint96 public constant INITIAL_ROYALTY_BPS = 500;

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
    error ZeroAddress();
    error AlreadyRevealed();
    error MetadataIsFrozen();

    event MinterSet(address indexed minter);
    event MinterLocked(address indexed minter);
    event Revealed(string baseURI);
    event BaseURIUpdated(string baseURI);
    event ContractURIUpdated(string contractURI);
    event MetadataFrozen();

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
        // changeable afterwards, so this is a starting point, not a promise.
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

    /// @notice Permanently freeze the minter. After this the sale contract can
    ///         never be swapped, so holders can verify exactly one contract can
    ///         ever create a token.
    function lockMinter() external onlyOwner {
        if (minter == address(0)) revert MinterNotSet();
        minterLocked = true;
        emit MinterLocked(minter);
    }

    /// @notice Flip from the shared pre-reveal image to per-token metadata.
    /// @dev Owner-controlled on purpose. A hard `totalMinted == MAX_SUPPLY`
    ///      gate would mean a mint that stalls one short of 3,333 could never
    ///      be revealed by anyone, ever — a permanent brick with no way out.
    function reveal(string calldata baseURI_) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (metadataFrozen) revert MetadataIsFrozen();
        revealed = true;
        _baseTokenURI = baseURI_;
        emit Revealed(baseURI_);
    }

    /// @notice Correct the base URI. Exists only so a typo in a CID is not
    ///         permanent; `freezeMetadata` is what makes the collection final.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function setUnrevealedURI(string calldata unrevealedURI_) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _unrevealedURI = unrevealedURI_;
    }

    /// @notice Collection-level metadata for marketplaces: name, description,
    ///         banner, link. Left mutable past `freezeMetadata` because it
    ///         describes the storefront, not the artwork.
    function setContractURI(string calldata contractURI_) external onlyOwner {
        _contractURI = contractURI_;
        emit ContractURIUpdated(contractURI_);
    }

    /// @notice One-way. After this no owner, present or future, can change what
    ///         any token points at.
    function freezeMetadata() external onlyOwner {
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    /// @notice Change the secondary-sale royalty. `feeNumerator` is in
    ///         hundredths of a percent: 500 = 5%, 0 = none.
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function deleteDefaultRoyalty() external onlyOwner {
        _deleteDefaultRoyalty();
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
        return super.supportsInterface(interfaceId);
    }
}
