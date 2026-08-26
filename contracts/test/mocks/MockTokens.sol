// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// A well-behaved $LINE: 1B supply, 18 decimals, real burnFrom.
contract MockLine is ERC20Burnable {
    constructor() ERC20("Line", "LINE") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// A launchpad token with no burn entrypoint — exercises the DEAD path.
contract MockNoBurn is ERC20 {
    constructor() ERC20("NoBurn", "NB") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Takes a 1% cut on transfer. Must never be able to buy a mint.
contract MockFeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xFEE), fee);
            super._update(from, to, value - fee);
            return;
        }
        super._update(from, to, value);
    }
}

/// Claims to burn and does nothing. Must never be able to buy a mint.
contract MockLyingBurner is ERC20 {
    constructor() ERC20("Liar", "LIAR") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burnFrom(address, uint256) external {}
}

/// `burnFrom(account, amount)` that ignores `account` and burns from the
/// caller instead — a real pattern in the wild. Total supply falls by exactly
/// the amount, so a sink-only check passes while the payer never paid.
contract MockSelfBurner is ERC20 {
    constructor() ERC20("Self", "SELF") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burnFrom(address, uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

/// Tries to mint a second time from inside onERC721Received.
contract ReentrantBuyer is IERC721Receiver {
    address public target;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    function setTarget(address target_) external {
        target = target_;
    }

    function buy() external returns (uint256) {
        (bool ok, bytes memory data) = target.call(abi.encodeWithSignature("mint()"));
        require(ok, "outer mint failed");
        return abi.decode(data, (uint256));
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!reentryAttempted) {
            reentryAttempted = true;
            // Expected to revert on ReentrancyGuard. The outcome is recorded
            // rather than discarded so the test asserts on it directly.
            (bool ok,) = target.call(abi.encodeWithSignature("mint()"));
            reentrySucceeded = ok;
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
