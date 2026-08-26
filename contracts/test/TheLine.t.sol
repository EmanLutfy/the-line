// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TheLine} from "../src/TheLine.sol";

contract TheLineTest is Test {
    TheLine internal nft;

    address internal owner = address(0xA11CE);
    address internal minter = address(0x1111);
    address internal alice = address(0xBEEF);

    string internal constant UNREVEALED = "ipfs://PRE/pre-reveal.json";
    string internal constant BASE = "ipfs://REVEALED/";
    string internal constant CONTRACT_URI = "ipfs://COLLECTION/contract.json";
    bytes32 internal constant PROVENANCE = keccak256("the-line-3333");

    function setUp() public {
        vm.startPrank(owner);
        nft = new TheLine(owner, UNREVEALED, CONTRACT_URI, PROVENANCE);
        nft.setMinter(minter);
        vm.stopPrank();
    }

    function _mint(uint256 n) internal {
        vm.startPrank(minter);
        for (uint256 i = 0; i < n; i++) {
            nft.mintNext(alice);
        }
        vm.stopPrank();
    }

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
        vm.prank(owner);
        nft.reveal(BASE);

        assertTrue(nft.revealed());
        assertEq(nft.tokenURI(1), "ipfs://REVEALED/1.json");
        assertEq(nft.tokenURI(2), "ipfs://REVEALED/2.json");
    }

    function test_RevealOnlyOnce() public {
        vm.startPrank(owner);
        nft.reveal(BASE);
        vm.expectRevert(TheLine.AlreadyRevealed.selector);
        nft.reveal("ipfs://OTHER/");
        vm.stopPrank();
    }

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

    function test_OnlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert(TheLine.NotMinter.selector);
        nft.mintNext(alice);

        vm.prank(owner);
        vm.expectRevert(TheLine.NotMinter.selector);
        nft.mintNext(owner);
    }

    function test_LockMinterRequiresOneToBeSet() public {
        vm.startPrank(owner);
        TheLine fresh = new TheLine(owner, UNREVEALED, CONTRACT_URI, PROVENANCE);
        vm.expectRevert(TheLine.MinterNotSet.selector);
        fresh.lockMinter();
        vm.stopPrank();
    }

    function test_TokenURIRevertsForUnmintedToken() public {
        vm.expectRevert();
        nft.tokenURI(1);
    }

    function test_SupplyStopsAt3333() public {
        _mint(3333);
        assertEq(nft.totalMinted(), 3333);
        assertEq(nft.totalSupply(), 3333);

        vm.prank(minter);
        vm.expectRevert(TheLine.SupplyExhausted.selector);
        nft.mintNext(alice);
    }

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        nft.transferOwnership(alice);
        // Not yet: a mistyped address cannot strand the collection.
        assertEq(nft.owner(), owner);

        vm.prank(alice);
        nft.acceptOwnership();
        assertEq(nft.owner(), alice);
    }

    /* -------------------------------------------------- royalty & storefront */

    function test_SupportsErc2981AndErc721() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd), "ERC721");
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

    function test_RoyaltyCanBeRemovedEntirely() public {
        vm.prank(owner);
        nft.deleteDefaultRoyalty();
        (address receiver, uint256 amount) = nft.royaltyInfo(1, 1 ether);
        assertEq(receiver, address(0));
        assertEq(amount, 0);
    }

    function test_OnlyOwnerCanChangeRoyalty() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.setDefaultRoyalty(alice, 1000);
    }

    function test_ContractURIIsSetAndUpdatable() public {
        assertEq(nft.contractURI(), CONTRACT_URI);
        vm.prank(owner);
        nft.setContractURI("ipfs://NEW/contract.json");
        assertEq(nft.contractURI(), "ipfs://NEW/contract.json");
    }

    /// The storefront description is not the artwork, so freezing metadata
    /// must not lock the owner out of fixing a banner or a link.
    function test_ContractURISurvivesMetadataFreeze() public {
        vm.startPrank(owner);
        nft.freezeMetadata();
        nft.setContractURI("ipfs://STILL/contract.json");
        vm.stopPrank();
        assertEq(nft.contractURI(), "ipfs://STILL/contract.json");
    }

    /// Reveal is owner-controlled by design: a hard sold-out gate would brick
    /// the collection forever if the mint stopped one short.
    function test_OwnerMayRevealBeforeSoldOut() public {
        _mint(5);
        vm.prank(owner);
        nft.reveal(BASE);
        assertTrue(nft.revealed());
        assertEq(nft.tokenURI(5), "ipfs://REVEALED/5.json");
    }

    function test_OnlyOwnerMayReveal() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.reveal(BASE);
    }
}
