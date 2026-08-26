// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TheLine} from "../src/TheLine.sol";
import {LineMint} from "../src/LineMint.sol";
import {MockLine} from "../test/mocks/MockTokens.sol";

/// Testnet only. Deploys a stand-in $LINE alongside the real pair and wires
/// everything up in one broadcast, so the whole flow can be exercised end to
/// end before the actual token exists.
///
/// Deliberately does NOT call `lockConfig` or `lockMinter`: on testnet we want
/// to be able to re-point and re-run. Both locks are part of the mainnet
/// checklist instead, where they are the whole point.
///
///   forge script script/DeployTestnet.s.sol:DeployTestnet \
///     --rpc-url robinhood_testnet --account theline-deployer \
///     --sender $OWNER_ADDRESS --broadcast -vvvv
contract DeployTestnet is Script {
    uint256 constant PRICE = 150_000 ether; // 18 decimals, matching MockLine

    function run() external {
        address owner = vm.envAddress("OWNER_ADDRESS");
        string memory unrevealedURI = vm.envString("UNREVEALED_URI");
        string memory contractURI = vm.envString("CONTRACT_URI");
        bytes32 provenance = vm.envBytes32("PROVENANCE_HASH");

        vm.startBroadcast();

        // A stand-in for $LINE: 1B supply to the deployer, real burnFrom.
        MockLine line = new MockLine();

        TheLine nft = new TheLine(owner, unrevealedURI, contractURI, provenance);
        LineMint sale = new LineMint(owner, address(nft));

        nft.setMinter(address(sale));
        sale.configure(address(line), PRICE, true);
        sale.setSaleOpen(true);

        vm.stopBroadcast();

        console2.log("");
        console2.log("NEXT_PUBLIC_LINE_ADDRESS =", address(line));
        console2.log("NEXT_PUBLIC_NFT_ADDRESS  =", address(nft));
        console2.log("NEXT_PUBLIC_MINT_ADDRESS =", address(sale));
        console2.log("");
        console2.log("Sale is open. The deployer holds 1,000,000,000 test $LINE,");
        console2.log("which is 6,666 mints at 150,000 each.");
    }
}
