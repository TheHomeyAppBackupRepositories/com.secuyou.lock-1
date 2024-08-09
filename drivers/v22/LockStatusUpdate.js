'use strict';

/** BitFields */
/** Lock State */
const LOCK_STATE_BYTE_0 = 0 ;    // lock position - (0) locked (1) unlocked
const LOCK_STATE_BYTE_1 = 1 ;    // pincode check - int = 16 means all digit in pin is correct
const LOCK_STATE_BYTE_2 = 2 ;    // Battery state (0) Battery GOOD ....(3) Battery EMPTY
const LOCK_STATE_BYTE_3 = 3 ;    // Handle state (0) Handle closed (1/2) Handle open or Handle KIP
const LOCK_STATE_BYTE_4 = 4 ;    // HomeLock OFF (0) HomeLock ON (1)

const LOCKING_MECHANISM_POSITION = {UNLOCKED:0, LOCKED:1, LOCK_UNLOCK_IN_PROGRESS:2, UNKNOWN_POSITION:3}
const LOCK_STATE = { UNARMED:0, ARMED:1, UNKNOWN_STATE:2 }
const HANDLE_STATE = {FCHC:0, FCHO:1, FOHC:2, FOHO:3, FOHU_KIP:4,FOHO_TBT:5, UNKNOWN_HANDLE_STATE:6};
const BATTERY_STATUS = {BATTERY_GOOD:0, BATTERY_LOW:1, BATTERY_CRITICAL:2, BATTERY_EMPTY:3, BATTERY_UNKNOWN:4}

var PIN_CODE_CORRECT = false
var HOME_LOCK = false

var mLockState = LOCK_STATE.UNKNOWN_STATE;
var mLockPosition = LOCKING_MECHANISM_POSITION.UNKNOWN_POSITION;
var mHandleState = HANDLE_STATE.UNKNOWN_HANDLE_STATE;
var mBatteryStatus = BATTERY_STATUS.BATTERY_UNKNOWN

var value;

class lockStatusUpdate {

    BATTERY_STATUS(value)
    {
        this.value = value;
    }

    static getValue(){ return  value;}

    static getStringValue() {
        switch (value) {
            case 0:
                return "Good";
            case 1:
                return "Low";
            case 2:
                return "Critical";
            case 3:
                return "Empty";
            default:
                return "Good";
        }
    }
    
    static readBatteryState(lockStatusBytes) {

        // Extraxct the Battery Status Data
        var batterystatus;

        batterystatus = lockStatusBytes[LOCK_STATE_BYTE_2];  // info on Battery status is contained in Byte[1]

        if(batterystatus == BATTERY_STATUS.BATTERY_GOOD)
        {
            mBatteryStatus = BATTERY_STATUS.BATTERY_GOOD;

        }else  if(batterystatus == BATTERY_STATUS.BATTERY_LOW)
        {
            mBatteryStatus = BATTERY_STATUS.BATTERY_LOW;

        }else  if(batterystatus == BATTERY_STATUS.BATTERY_CRITICAL)
        {
            mBatteryStatus = BATTERY_STATUS.BATTERY_CRITICAL;

        }else  if(batterystatus == BATTERY_STATUS.BATTERY_EMPTY)
        {
            mBatteryStatus = BATTERY_STATUS.BATTERY_EMPTY;
        }else
        {
            mBatteryStatus = BATTERY_STATUS.BATTERY_UNKNOWN;
        }
    }

    static readHandlePositionState(lockStatusBytes) {

        // Extraxct the Battery Status Data
        var handlestatus;
        handlestatus = lockStatusBytes[LOCK_STATE_BYTE_3];  // info on Battery status is contained in Byte[1]

        if(handlestatus == 0 || handlestatus == 1)
        {
            mHandleState = HANDLE_STATE.FCHC;
        }
        else { // mUnitState value = 2 (open)
            mHandleState = HANDLE_STATE.FCHO;
        }

    }

    static getLockState (){
        return mLockPosition
    }

    static getHomeLockState (){
        return HOME_LOCK
    }

    static setLockStatus (lockStatus) {
        // TODO: Add check wheather the parameters are in range

        var lockStatusByte = Buffer.alloc(5)

        // Lock State
        lockStatusByte = lockStatus[LOCK_STATE_BYTE_0];

        // Lock Position
        if (lockStatusByte == 0) {
            mLockPosition = LOCKING_MECHANISM_POSITION.UNLOCKED;
        } else if (lockStatusByte == 1) {
            mLockPosition = LOCKING_MECHANISM_POSITION.LOCKED;
        } else {
            mLockPosition = LOCKING_MECHANISM_POSITION.UNKNOWN_POSITION;
        }

        // Extract the UNIT STATE
        lockStatusByte = lockStatus[LOCK_STATE_BYTE_1];
        if (lockStatusByte == 16)
        {
            PIN_CODE_CORRECT = true;
        }
        else
        {
            PIN_CODE_CORRECT = false;
        }

        lockStatusByte = lockStatus[LOCK_STATE_BYTE_4];
        if (lockStatusByte == 0)
        {
            HOME_LOCK = false;
        }
        else if (lockStatusByte == 1)
        {
            HOME_LOCK = true;
        }

        // Extraxct the Battery Status Data
        this.readBatteryState(lockStatus);

        // Extraxct the Handle Position Data
        this.readHandlePositionState(lockStatus);
    }
}
module.exports = lockStatusUpdate