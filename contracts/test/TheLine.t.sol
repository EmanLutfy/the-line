// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TheLine} from "../src/TheLine.sol";

/// The minter must be a contract, so the test contract plays that part — it
/// has code, and it can call `mintNext` directly.
contract TheLineTest is Test {
    TheLine internal nft;

    address internal owner = address(0xA11CE);
    address internal alice = address(0xBEEF);

    string internal constant UNREVEALED = "ipfs://PRE/pre-reveal.json";
    string internal constant BASE = "ipfs://REVEALED/";
    string internal constant CONTRACT_URI = "ipfs://COLLECTION/contract.json";
    bytes32 internal constant PROVENANCE = keccak256("the-line-3333");

    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    function setUp() public {
        vm.startPrank(owner);
        nft = new TheLine(owner, UNREVEALED, CONTRACT_URI, PROVENANCE);
        nft.setMinter(address(this));
        vm.stopPrank();
    }

    function _mint(uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            nft.mintNext(alice);
        }
    }

    function _reveal() internal {
        vm.prank(owner);
        nft.reveal(BASE);
    }

    /* ------------------------------------------------------------- basics */

    function test_ProvenanceIsImmutable() public view {
        assertEq(nft.provenanceHash(), PROVENANCE);
    }

    function test_EveryUnrevealedTokenSharesOneURI() public {
        _mint(3);
        assertEq(nft.tokenURI(1), UNREVEALED);
        assertEq(nft.tokenURI(2), UNREVEALED);
        assertEq(nft.tokenURI(3), UNREVEALED);
    }

    function test_RevealSwitchesToPerTokenMetadata() public {
        _mint(2);
        _reveal();
        assertTrue(nft.revealed());
        assertEq(nft.tokenURI(1), "ipfs://REVEALED/1.json");
        assertEq(nft.tokenURI(2), "ipfs://REVEALED/2.json");
    }

    function test_RevealOnlyOnce() public {
        _reveal();
        vm.prank(owner);
        vm.expectRevert(TheLine.AlreadyRevealed.selector);
        nft.reveal("ipfs://OTHER/");
    }

    function test_OnlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert(TheLine.NotMinter.selector);
        nft.mintNext(alice);

        vm.prank(owner);
        vm.expectRevert(TheLine.NotMinter.selector);
        nft.mintNext(owner);
    }

    function test_TokenURIRevertsForUnmintedToken() public {
        vm.expectRevert();
        nft.tokenURI(1);
    }

    function test_SupplyStopsAt3333() public {
        _mint(3333);
        assertEq(nft.totalMinted(), 3333);
        assertEq(nft.totalSupply(), 3333);

        vm.expectRevert(TheLine.SupplyExhausted.selector);
        nft.mintNext(alice);
    }

    /* --------------------------------------------------------- the minter */

    function test_LockMinterRequiresOneToBeSet() public {
        vm.startPrank(owner);
        TheLine fresh = new TheLine(owner, UNREVEALED, CONTRACT_URI, PROVENANCE);
        vm.expectRevert(TheLine.MinterNotSet.selector);
        fresh.lockMinter();
        vm.stopPrank();
    }

    /// Locking an EOA would leave a permanent, unpaid, unlimited mint right
    /// while the on-chain state looked like the honest configuration.
    function test_MinterCannotBeLockedToAnEOA() public {
        vm.startPrank(owner);
        TheLine fresh = new TheLine(owner, UNREVEALED, CONTRACT_URI, PROVENANCE);
        fresh.setMinter(alice);
        vm.expectRevert(TheLine.MinterNotAContract.selector);
        fresh.lockMinter();
        vm.stopPrank();
    }

    function test_MinterCannotBeSwappedOnceLocked() public {
        vm.startPrank(owner);
        nft.lockMinter();
        vm.expectRevert(TheLine.MinterAlreadyLocked.selector);
        nft.setMinter(address(this));
        vm.stopPrank();
    }

    function test_LockMinterIsNotRepeatable() public {
        vm.startPrank(owner);
        nft.lockMinter();
        vm.expectRevert(TheLine.MinterAlreadyLocked.selector);
        nft.lockMinter();
        vm.stopPrank();
    }

    /* -------------------------------------------------------- the metadata */

    function test_BaseURICanBeCorrectedThenFrozenForever() public {
        _mint(1);
        vm.startPrank(owner);
        nft.reveal("ipfs://TYPO/");
        assertEq(nft.tokenURI(1), "ipfs://TYPO/1.json");

        nft.setBaseURI(BASE);
        assertEq(nft.tokenURI(1), "ipfs://REVEALED/1.json");

        nft.freezeMetadata();
        vm.expectRevert(TheLine.MetadataIsFrozen.selector);
        nft.setBaseURI("ipfs://RUGGED/");
        vm.stopPrank();

        assertEq(nft.tokenURI(1), "ipfs://REVEALED/1.json");
    }

    /// Freezing before the reveal would strand all 3,333 on the placeholder
    /// permanently: reveal, setBaseURI and setUnrevealedURI would all revert on
    /// the freeze, and no owner could ever undo it.
    function test_CannotFreezeBeforeReveal() public {
        vm.prank(owner);
        vm.expectRevert(TheLine.NotRevealed.selector);
        nft.freezeMetadata();
    }

    function test_FreezeIsNotRepeatable() public {
        _reveal();
        vm.startPrank(owner);
        nft.freezeMetadata();
        vm.expectRevert(TheLine.MetadataIsFrozen.selector);
        nft.freezeMetadata();
        vm.stopPrank();
    }

    /// baseURI + tokenId + ".json" only works if the base is a directory.
    /// Without the slash every token resolves to ".../metadata1.json".
    function test_BaseURIMustEndInASlash() public {
        vm.startPrank(owner);
        vm.expectRevert(TheLine.InvalidBaseURI.selector);
        nft.reveal("ipfs://REVEALED");
        vm.expectRevert(TheLine.InvalidBaseURI.selector);
        nft.reveal("");
        vm.stopPrank();
    }

    /// Marketplaces refresh on ERC-4906, not on a custom event. Without this,
    /// a reveal is invisible and 3,333 tokens keep serving the cached
    /// placeholder until each is refreshed by hand.
    function test_RevealEmitsBatchMetadataUpdate() public {
        vm.expectEmit(false, false, false, true);
        emit BatchMetadataUpdate(1, 3333);
        vm.prank(owner);
        nft.reveal(BASE);
    }

    function test_SetBaseURIEmitsBatchMetadataUpdate() public {
        _reveal();
        vm.expectEmit(false, false, false, true);
        emit BatchMetadataUpdate(1, 3333);
        vm.prank(owner);
        nft.setBaseURI("ipfs://SECOND/");
    }

    function test_SupportsErc4906() public view {
        assertTrue(nft.supportsInterface(0x49064906), "ERC4906");
    }

    /* ------------------------------------------------------------ storefront */

    function test_ContractURIIsSetAndUpdatable() public {
        assertEq(nft.contractURI(), CONTRACT_URI);
        vm.prank(owner);
        nft.setContractURI("ipfs://NEW/contract.json");
        assertEq(nft.contractURI(), "ipfs://NEW/contract.json");
    }

    /// The storefront description is not the artwork, so freezing the metadata
    /// must not lock the owner out of fixing a banner or a link.
    function test_ContractURISurvivesMetadataFreeze() public {
        _reveal();
        vm.startPrank(owner);
        nft.freezeMetadata();
        nft.setContractURI("ipfs://STILL/contract.json");
        vm.stopPrank();
        assertEq(nft.contractURI(), "ipfs://STILL/contract.json");
    }

    /* -------------------------------------------------------------- royalty */

    function test_SupportsErc2981AndErc721() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd), "ERC721");
        assertTrue(nft.supportsInterface(0x5b5e139f), "ERC721Metadata");
        assertTrue(nft.supportsInterface(0x2a55205a), "ERC2981");
        assertTrue(nft.supportsInterface(0x01ffc9a7), "ERC165");
    }

    function test_DefaultRoyaltyIsFivePercentToOwner() public view {
        (address receiver, uint256 amount) = nft.royaltyInfo(1, 1 ether);
        assertEq(receiver, owner);
        assertEq(amount, 0.05 ether);
    }

    function test_RoyaltyRecipientAndRateCanBeChangedLater() public {
        address payout = address(0x7777);
        vm.prank(owner);
        nft.setDefaultRoyalty(payout, 250);

        (address receiver, uint256 amount) = nft.royaltyInfo(1, 1 ether);
        assertEq(receiver, payout);
        assertEq(amount, 0.025 ether);
    }

    /// A zero rate is expressed with a real receiver, never by deleting the
    /// royalty — deleting leaves a contract that still advertises ERC-2981 and
    /// returns address(0), which reverts for payouts in tokens that refuse it.
    function test_RoyaltyCanBeSetToZeroWithARealReceiver() public {
        vm.prank(owner);
        nft.setDefaultRoyalty(owner, 0);
        (address receiver, uint256 amount) = nft.royaltyInfo(1, 1 ether);
        assertEq(receiver, owner);
        assertEq(amount, 0);
    }

    /// Without a ceiling, a compromised key can set 100% after every "permanent
    /// lock" is pulled and make each token unsellable everywhere.
    function test_RoyaltyIsCappedAtTenPercent() public {
        vm.startPrank(owner);
        nft.setDefaultRoyalty(owner, 1000);
        vm.expectRevert(TheLine.RoyaltyTooHigh.selector);
        nft.setDefaultRoyalty(owner, 1001);
        vm.expectRevert(TheLine.RoyaltyTooHigh.selector);
        nft.setDefaultRoyalty(owner, 10000);
        vm.stopPrank();
    }

    function test_RoyaltyReceiverCannotBeZero() public {
        vm.prank(owner);
        vm.expectRevert(TheLine.ZeroAddress.selector);
        nft.setDefaultRoyalty(address(0), 500);
    }

    function test_OnlyOwnerCanChangeRoyalty() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.setDefaultRoyalty(alice, 500);
    }

    /* ------------------------------------------------------------ ownership */

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        nft.transferOwnership(alice);
        // Not yet: a mistyped address cannot strand the collection.
        assertEq(nft.owner(), owner);

        vm.prank(alice);
        nft.acceptOwnership();
        assertEq(nft.owner(), alice);
    }

    /// Renouncing before the reveal, or before a minter is set, would be
    /// unrecoverable for everyone. There is no state in which it helps.
    function test_RenounceIsDisabled() public {
        vm.prank(owner);
        vm.expectRevert(TheLine.RenounceDisabled.selector);
        nft.renounceOwnership();
        assertEq(nft.owner(), owner);
    }

    function test_OnlyOwnerMayReveal() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.reveal(BASE);
    }
}
