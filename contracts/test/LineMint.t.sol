// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TheLine} from "../src/TheLine.sol";
import {LineMint} from "../src/LineMint.sol";
import {MockLine, MockNoBurn, MockFeeToken, MockLyingBurner, ReentrantBuyer} from "./mocks/MockTokens.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LineMintTest is Test {
    TheLine internal nft;
    LineMint internal sale;
    MockLine internal line;

    address internal owner = address(0xA11CE);
    address internal alice = address(0xBEEF);
    address internal bob = address(0xCAFE);

    uint256 internal constant PRICE = 150_000 ether;
    string internal constant UNREVEALED = "ipfs://PRE/pre-reveal.json";
    bytes32 internal constant PROVENANCE = keccak256("provenance");

    function setUp() public {
        vm.startPrank(owner);
        nft = new TheLine(owner, UNREVEALED, "ipfs://COLLECTION/contract.json", PROVENANCE);
        sale = new LineMint(owner, address(nft));
        nft.setMinter(address(sale));
        nft.lockMinter();
        vm.stopPrank();

        line = new MockLine();

        vm.startPrank(owner);
        sale.configure(address(line), PRICE, true);
        sale.setSaleOpen(true);
        vm.stopPrank();

        _fund(alice, PRICE * 20);
        _fund(bob, PRICE * 20);
    }

    function _fund(address who, uint256 amount) internal {
        line.mintTo(who, amount);
        vm.prank(who);
        line.approve(address(sale), type(uint256).max);
    }

    /* ------------------------------------------------------------- happy */

    function test_MintBurnsAndAssignsIdOne() public {
        uint256 supplyBefore = line.totalSupply();

        vm.prank(alice);
        uint256 tokenId = sale.mint();

        assertEq(tokenId, 1, "first id must be 1");
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.totalMinted(), 1);
        assertEq(line.totalSupply(), supplyBefore - PRICE, "supply must actually drop");
        assertEq(line.balanceOf(address(sale)), 0, "sale must never custody");
    }

    function test_IdsAreStrictlySequentialAcrossBuyers() public {
        vm.prank(alice);
        assertEq(sale.mint(), 1);
        vm.prank(bob);
        assertEq(sale.mint(), 2);
        vm.prank(alice);
        assertEq(sale.mint(), 3);
        vm.prank(bob);
        assertEq(sale.mint(), 4);
    }

    function test_DeadAddressPathWhenTokenCannotBurn() public {
        MockNoBurn nb = new MockNoBurn();
        nb.mintTo(alice, PRICE);

        vm.prank(owner);
        sale.configure(address(nb), PRICE, false);

        vm.startPrank(alice);
        nb.approve(address(sale), PRICE);
        sale.mint();
        vm.stopPrank();

        assertEq(nb.balanceOf(sale.DEAD()), PRICE, "tokens must land on the dead address");
        assertEq(nb.balanceOf(alice), 0);
    }

    /* ------------------------------------------------------------ guards */

    function test_RevertWhenSaleClosed() public {
        vm.prank(owner);
        sale.setSaleOpen(false);
        vm.prank(alice);
        vm.expectRevert(LineMint.SaleClosed.selector);
        sale.mint();
    }

    function test_RevertWhenPaused() public {
        vm.prank(owner);
        sale.pause();
        vm.prank(alice);
        vm.expectRevert();
        sale.mint();
    }

    function test_RevertWhenInsufficientBalance() public {
        address broke = address(0xD00D);
        vm.prank(broke);
        line.approve(address(sale), type(uint256).max);
        vm.prank(broke);
        vm.expectRevert();
        sale.mint();
    }

    function test_RevertWhenNoApproval() public {
        address holder = address(0xF00D);
        line.mintTo(holder, PRICE);
        vm.prank(holder);
        vm.expectRevert();
        sale.mint();
    }

    function test_PublicCannotMintNftDirectly() public {
        vm.prank(alice);
        vm.expectRevert(TheLine.NotMinter.selector);
        nft.mintNext(alice);
    }

    function test_MinterCannotBeSwappedOnceLocked() public {
        vm.prank(owner);
        vm.expectRevert(TheLine.MinterAlreadyLocked.selector);
        nft.setMinter(address(0xBAD));
    }

    function test_MaxPerWalletEnforced() public {
        vm.prank(owner);
        sale.setMaxPerWallet(2);

        vm.startPrank(alice);
        sale.mint();
        sale.mint();
        vm.expectRevert(LineMint.WalletLimitReached.selector);
        sale.mint();
        vm.stopPrank();

        // The cap is per wallet, not global.
        vm.prank(bob);
        assertEq(sale.mint(), 3);
    }

    function test_LockedConfigCannotChangePrice() public {
        vm.startPrank(owner);
        sale.lockConfig();
        vm.expectRevert(LineMint.ConfigIsLocked.selector);
        sale.configure(address(line), 1 ether, true);
        vm.stopPrank();
    }

    /* --------------------------------------------------- hostile tokens */

    /// The payer loses exactly `price` here — the fee is skimmed out of the
    /// transfer — so a check on the payer's balance would wave this through
    /// while part of the payment sat in a live fee wallet. Only the burn
    /// address receiving every unit proves the tokens are gone.
    function test_FeeOnTransferTokenCannotBuy() public {
        MockFeeToken fee = new MockFeeToken();
        fee.mintTo(alice, PRICE * 2);

        vm.prank(owner);
        sale.configure(address(fee), PRICE, false);

        vm.startPrank(alice);
        fee.approve(address(sale), type(uint256).max);
        vm.expectRevert(LineMint.BurnFailed.selector);
        sale.mint();
        vm.stopPrank();

        assertEq(nft.totalMinted(), 0, "no token may be handed out");
    }

    function test_LyingBurnerCannotBuy() public {
        MockLyingBurner liar = new MockLyingBurner();
        liar.mintTo(alice, PRICE);

        vm.prank(owner);
        sale.configure(address(liar), PRICE, true);

        vm.startPrank(alice);
        liar.approve(address(sale), type(uint256).max);
        vm.expectRevert(LineMint.BurnFailed.selector);
        sale.mint();
        vm.stopPrank();

        assertEq(nft.totalMinted(), 0);
    }

    function test_ReceiverHookCannotMintTwiceOnOnePayment() public {
        ReentrantBuyer attacker = new ReentrantBuyer();
        attacker.setTarget(address(sale));
        line.mintTo(address(attacker), PRICE * 5);

        vm.prank(address(attacker));
        line.approve(address(sale), type(uint256).max);

        attacker.buy();

        assertTrue(attacker.reentryAttempted(), "the hook must actually have tried");
        assertFalse(attacker.reentrySucceeded(), "reentrant mint must revert");
        assertEq(nft.totalMinted(), 1, "reentry must not produce a second token");
        assertEq(nft.balanceOf(address(attacker)), 1);
    }

    /* ----------------------------------------------------------- supply */

    function test_ExhaustsAtExactly3333() public {
        vm.prank(owner);
        sale.setMaxPerWallet(0);

        line.mintTo(alice, PRICE * 3333);
        vm.startPrank(alice);
        for (uint256 i = 0; i < 3333; i++) {
            sale.mint();
        }
        assertEq(nft.totalMinted(), 3333);
        assertEq(nft.ownerOf(3333), alice);
        assertEq(sale.remaining(), 0);

        vm.expectRevert(TheLine.SupplyExhausted.selector);
        sale.mint();
        vm.stopPrank();
    }

    /// Whatever the order or mix of buyers, an id is never handed out twice.
    function testFuzz_NoIdIsEverRepeated(uint8 count, uint256 seed) public {
        uint256 n = uint256(count) % 60 + 1;
        line.mintTo(alice, PRICE * n);
        line.mintTo(bob, PRICE * n);

        bool[] memory seen = new bool[](3334);
        for (uint256 i = 0; i < n; i++) {
            address buyer = uint256(keccak256(abi.encode(seed, i))) % 2 == 0 ? alice : bob;
            vm.prank(buyer);
            uint256 id = sale.mint();
            assertTrue(id >= 1 && id <= 3333, "id out of range");
            assertFalse(seen[id], "id handed out twice");
            seen[id] = true;
            assertEq(nft.ownerOf(id), buyer);
        }
        assertEq(nft.totalMinted(), n);
    }
}
