// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Context.sol";

abstract contract ExpressPausable {
    event PausedMint(address account);
    event PausedRedeem(address account);

    event UnpausedMint(address account);
    event UnpausedRedeem(address account);

    bool private _pausedMint;
    bool private _pausedRedeem;

    /*//////////////////////////////////////////////////////////////
                          Paused Mint
    //////////////////////////////////////////////////////////////*/

    modifier whenNotPausedMint() {
        require(!pausedMint(), "Pausable: Mint paused");
        _;
    }

    modifier whenPausedMint() {
        require(pausedMint(), "Pausable: Mint not paused");
        _;
    }

    function pausedMint() public view virtual returns (bool) {
        return _pausedMint;
    }

    function _pauseMint() internal virtual whenNotPausedMint {
        _pausedMint = true;
        emit PausedMint(msg.sender);
    }

    function _unpauseMint() internal virtual whenPausedMint {
        _pausedMint = false;
        emit UnpausedMint(msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                          Paused Redeem
    //////////////////////////////////////////////////////////////*/

    modifier whenNotPausedRedeem() {
        require(!pausedRedeem(), "Pausable: Redeem paused");
        _;
    }

    modifier whenPausedRedeem() {
        require(pausedRedeem(), "Pausable: Redeem not paused");
        _;
    }

    function pausedRedeem() public view virtual returns (bool) {
        return _pausedRedeem;
    }

    function _pauseRedeem() internal virtual whenNotPausedRedeem {
        _pausedRedeem = true;
        emit PausedRedeem(msg.sender);
    }

    function _unpauseRedeem() internal virtual whenPausedRedeem {
        _pausedRedeem = false;
        emit UnpausedRedeem(msg.sender);
    }
}
