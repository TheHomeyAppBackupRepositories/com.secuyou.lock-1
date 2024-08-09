'use strict';

const Homey = require('homey');
//const fs = require('fs');
const EventEmitter = require('events')
const lockStatusUpdate = require('./LockStatusUpdate.js');
const { getLockState } = require('./LockStatusUpdate.js');
const RETRY_INTERVAL =  10 * 1000; // 1000 = 1 second


// State Lock and App
const stateDevice = {KEY_GENERATION:0, KEY_CONFIRMATION:1, KEY_CHECKING:2, KEY_BLOCKING:3};
const stateApp = {INITIAL:0, SERVICES_DISCOVERED:1, PROXIMITY_TAG_CODE_REQUEST:2, PROXIMITY_TAG_CODE_ACK:3, PROXIMITY_TAG_READY_TO_PASS_PINCODE:4, PROXIMITY_TAG_PINCODE_SEND:5};

var lockState = stateDevice.KEY_GENERATION;
var appState = stateApp.INITIAL;

var arm = false
var hprState = true

// Values
var randomCode = Buffer.alloc(16);
var sendValue = Buffer.alloc(16);
var deviceHasPincode = true;

// Lock commands
const lock_unlock = Buffer.alloc(1, 0x00);
const homelockToggle = Buffer.alloc(1, 0xFF);
const disable_unlockButton = Buffer.alloc(1, 0xF2);
const enable_unlockButton = Buffer.alloc(1, 0xF3);


// Bluetooth Lock specifics
var peripheral
var characteristics;
var service

// Pincode
var pincode0 = 1;
var pincode1 = 2;
var pincode2 = 3;
var pincode3 = 4;
var pincode4 = 5;

// Crypt key and variable
const key = Buffer.from ([0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c])

const KEY_SERVICE_UUID             = 'b1de152885ef37cc00c8a3cf3412a548'; 
const KEY_CHARACTERISTIC_UUID      = 'b1de152985ef37cc00c8a3cf3412a548';
const CONFIRM_CHARACTERISTIC_UUID  = 'b1de153085ef37cc00c8a3cf3412a548';
const STATE_CHARACTERISTIC_UUID    = 'b1de153185ef37cc00c8a3cf3412a548';

var my_characteristic_uuid = [] 

const eventEmitter = new EventEmitter()

class MyDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    // this.setUnavailable().catch(this.error);
    // this.homey.ble.on("connection", (stream) => {
    //   //this.setAvailable().catch(this.error);
    //   this.log('connected')
    // });

    // this.on('state-changed', (isOn) => {
    //   this.setCapabilityValue('locked', isOn).catch(this.error);
    // });

    // retrieve pincode from Driver
    this.getPincodeDriver()

    this.registerCapabilityListener("locked", async (value) => {
      if ( !this.getCapabilityValue('handle') && hprState){
        // Send message to user that the handle is open and lock cannot lock
        this.homey.notifications.createNotification({excerpt: this.homey.__("handle-open")})
        // set value to unlocked
        this.log('Trying to lock - but cannot lock');
        this.characteristics[0].write(lock_unlock)

      } else {
        if (value){
          this.lock()
          this.log('Value true - lock');

        } else {
          this.unlock()
          this.log('Value false - unlock');
        }      
      }
    });

    this._interval = this.homey.setInterval(() => {
      if (appState == stateApp.INITIAL && !arm){
        this.log('HOMEY starts scanning');
        this.scan();
      }
      
    }, RETRY_INTERVAL);

    // Start as soon as app has been loaded
    this.scan()

    this.log('Secuyou Lock has been initialized');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */

   async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Secuyou Smart Lock settings where changed');
    // run when the user has changed the device's settings in Homey.
    // changedKeysArr contains an array of keys that have been changed
    // if the settings must not be saved for whatever reason:
    // throw new Error('Your error message');

    if (changedKeys.indexOf("homelock") >= 0) {
      await this.characteristics[1].write(homelockToggle);
      this.log('Homelock toggled')
    } 
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Secuyou Smart Lock was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Secuyou Lock has been deleted');

      await this.peripheral.disconnect();

    // try {
    //   await this.peripheral.disconnect();
    //   this.log ('Disconnected peripheral due to a DELETE of peripheral') // The lock could not disconnect
    // } catch (error) {
    //   this.log (error) // The lock could not disconnect
    // }
    
    // Reset the lock state and app state
    lockState = stateDevice.KEY_GENERATION;
    appState = stateApp.INITIAL;
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Secuyou Lock has been added');

    // retrieve pincode from Driver
    this.getPincodeDriver()

    // Register once and for all in settings
    var strValuePincode = pincode0 + '' + pincode1 + '' + pincode2 + '' + pincode3 + '' + pincode4
    const settings = this.getSettings();
    await this.setSettings({
      // only provide keys for the settings you want to change
      pincode: strValuePincode,
    });
  }  

  // SECUYOU -------------------- functions  ------------------------------------------

  // Get pincode from Driver - need to be a function call
  getPincodeDriver (){
    pincode0 = this.driver.getValue('first')
    pincode1 = this.driver.getValue('second')
    pincode2 = this.driver.getValue('third')
    pincode3 = this.driver.getValue('fourth')
    pincode4 = this.driver.getValue('fifth')

    this.log('Pincode retrieved from Driver: ', pincode0 + '' + pincode1 + '' + pincode2 + '' + pincode3 + '' + pincode4); 
  }

  // Set Homelock to true
  async disarm () {
    this.log('DisArm')

    try {
      await this.characteristics[1].write(enable_unlockButton);
      arm = false

    } catch (error) {
      this.log('Error enabling unlock button:', error)
    }

  }

  async arm () {
    // Check if Lock is arm ready (handle is closed)
    if ( this.getCapabilityValue('handle')) {
        this.log('Arm')

        try {
          await this.characteristics[1].write(disable_unlockButton);
          arm = true

        } catch (error) {
          this.log('Error disabling unlock button:', error)
        }


        this.lock()
    }
  }

  async lock() {
    // only lock if unlocked
    if (lockStatusUpdate.getLockState() == 0 || lockStatusUpdate.getLockState() == 3){
      await this.characteristics[1].write(lock_unlock);
    }
  }

  async unlock() {
    // only unlock if locked
    if (lockStatusUpdate.getLockState() == 1 || lockStatusUpdate.getLockState() == 3){ 
      await this.characteristics[1].write(lock_unlock);
    }
  }

  

  async homelockToggle () {
    this.log('Homelock is: ', lockStatusUpdate.getHomeLockState())
    this.log('Arm toggle value: ', homelockToggle)
    if (lockStatusUpdate.getHomeLockState() == true){
      await this.characteristics[1].write(homelockToggle);
    }
  }

  async scan() {
    //this.setUnavailable().catch(this.error);

    // Reset the lock state and app state
    lockState = stateDevice.KEY_GENERATION;
    appState = stateApp.INITIAL;

    // Get the advertisement - we only need to get it once
    if (!this.advertisement) {
      this.log('Trying to scan for: ', this.getStore().peripheralUuid);
      try {
        this.advertisement = await this.homey.ble.find(this.getStore().peripheralUuid);
      }
      catch (error) {
        this.log('Error: ', error)
      }
    }

    this.log('Address: ', this.getStore().peripheralUuid);

    // Add this block if you wish to have a permanent connection.
    if (this.advertisement && appState == stateApp.INITIAL) {  
        // First step - connect 
        try {
          this.peripheral = await this.advertisement.connect()

          await new Promise(resolve => setTimeout(resolve, 1000)); // Trick from AdyR
          

        } catch (error) {
          this.log('Error: ', error)
        }

        try {
          const service = await this.peripheral.getService(KEY_SERVICE_UUID)
          this.log('Found services!!!!')

          await new Promise(resolve => setTimeout(resolve, 1000));  // Trick from AdyR
          
          this.characteristics = await service.discoverCharacteristics()
          this.log('Found characteristics!!!!')

        } catch (error) {
          this.log('Error: ', error)

        }

        this.log('Chars: ', this.characteristics[0].uuid)
        this.log('Chars: ', this.characteristics[2].uuid)
        
        // Set app state
        appState = stateApp.SERVICES_DISCOVERED;
        this.log('Services & Characteristics discovered')

        lockState = await this.characteristics[2].read()
        //this.log('State Device (Lock): ', lockState[0]); 

        this.peripheral.on('disconnect', () =>{
          this.log('disconnected')

          // Reset the lock state and app state
          lockState = stateDevice.KEY_GENERATION;
          appState = stateApp.INITIAL;
        });   

        // Notifications for KEY CHAR
        const data_key = await this.characteristics[0].subscribeToNotifications(data => {
          if (appState == stateApp.PROXIMITY_TAG_PINCODE_SEND) {
            this.log('Lockstatus:', data)
            lockStatusUpdate.setLockStatus(data)
            this.updateAppState(data)
          } else if (appState == stateApp.PROXIMITY_TAG_CODE_REQUEST) {
            // read random code - just in case Ble read times out 
            randomCode = data
            this.log('Random code: ', randomCode)
          }
        });

        // Notifications for STATE CHAR
        const data_state = await this.characteristics[2].subscribeToNotifications(data => {
          this.state_read (data);
          if (lockState[0] == stateDevice.KEY_CONFIRMATION || lockState[0] == stateDevice.KEY_CHECKING){
              this.state_machine_lock()
          }
          this.log('State Device (Lock): ', lockState[0]); 
        });

        // Kickstart the verification process - mimic of the smart phone app
        // State char and Key char each runs the state machine when app state is in ServiceDiscovery mode
        const promiseToDoSomething = () => {
          return new Promise(resolve => {
            this.state_machine_lock(0x01)
            resolve('Statemachine start - ')
          })
        }
        
        const watchOverSomeoneDoingSomething = async () => {
          const something = await promiseToDoSomething()
          try {
            randomCode = await this.characteristics[0].read()
          } catch (error) {
            this.log(error)
          }
             
          // this.log('Random code: ',randomCode)
          return something
        } 
        
        watchOverSomeoneDoingSomething().then(res => {
          this.state_machine_lock(0x00)
          this.log(res + ' - state machine second time')
        })
        // finished kicking off the verification process

    }
  }

  async updateAppState (value) {

    // Handle closing trigger flow card
    const handle_closing = this.homey.flow.getTriggerCard('handle-close-trigger');

    // Set capability LOCKED
    if (value[0] == 0) {
      this.setCapabilityValue('locked', false)
    } else if (value[0] == 1) {
      this.setCapabilityValue('locked', true)
    } else if (value[0] == 2){
      this.setCapabilityValue('locked', false)
    }
    
    // Set capability HANDLE
    if (value[3] == 2) {
      this.setCapabilityValue('handle', false).catch(this.error);
      this.homey.notifications.createNotification({excerpt: this.homey.__("handle-just-open")})
    } else if (value[3] == 0) {
      this.setCapabilityValue('handle', true).catch(this.error);
      this.homey.notifications.createNotification({excerpt: this.homey.__("handle-just-closed")})
      
      // Trigger flow card
       await handle_closing.trigger();

    }  else if (value[3] == 1) {
      this.setCapabilityValue('handle', true).catch(this.error);
      this.homey.notifications.createNotification({excerpt: this.homey.__("handle-just-closed")})

      // Trigger flow card
       await handle_closing.trigger();
      
    }

    // Settings update only if there is a mismatch between lock and setting
    const settings = this.getSettings();
    if (settings.homelock && value[4] == 0){
        await this.setSettings({
          // only provide keys for the settings you want to change
          homelock: false,
        });
    } else if (!settings.homelock && value[4] == 1){
        await this.setSettings({
          // only provide keys for the settings you want to change
          homelock: true,
        });
    }

    if (value[4] == 2 || value[4] == 3){
      // handle sensor is OFF - now lock disregarding the handle sensor
      hprState = false
    }

    // set battery level
    switch (value[2]) {
      case 0: // Good
        this.setBatteryLevel(100)
        break;
    
      case 1: // Low
        this.setBatteryLevel(50)
        break;

      case 2: //Critical
        this.setBatteryLevel(20)
        break;
    
      case 3: // Empty
        this.setBatteryLevel(10)
        break;

      default:
        this.setBatteryLevel(0)
        break;
    }

  }

// Read State of Lock Device
state_read (value){
  
    switch (value[0]) {
        case 0x00: 
          lockState[0] = stateDevice.KEY_GENERATION;
          break;
        case 0x01: 
          lockState[0] = stateDevice.KEY_CONFIRMATION;
          break;
        case 0x02:
          lockState[0] = stateDevice.KEY_CHECKING;
          break;
        case 0x03:
          lockState[0] = stateDevice.KEY_BLOCKING;
          break;
        default:
          break;
    }
}

setBatteryLevel(value){
  this.setCapabilityValue('measure_battery', value).catch(this.error)
}

// Encrypt pin code 
async PIN_ByteToByte() {
  
    var crypted = Buffer.alloc(16);

    var b = Buffer.alloc(16)

    // initialize with zeroes - just to be sure
    for (const i of b) {
          b[i] = 0x00;

          b[0] = pincode0;
          b[1] = pincode1;
          b[2] = pincode2;
          b[3] = pincode3;
          b[4] = pincode4;
    }

    this.log('B before: ', b)

    // blend into randomcode
    for (const [index, val] of randomCode.entries()) {
        b[index] += val;
    }

    this.log('B after: ', b) 

    //var code = Buffer.from(b, 'utf-8')
    // Example to demonstrate the use of cipher.final() method
    // Importing the crypto module
    const crypto = require('crypto')

    // Initialising the AES algorithm
    const algorithm = 'aes-128-ecb'

    // Initializing the cipher object to get cipher
    const cipher = crypto.createCipheriv(algorithm, key, null)
    //cipher.setAutoPadding(false)

    //Getting the updated string value with new data
    crypted = cipher.update(b)
    this.log('Crypted value:', crypted)

    //Adding the old value and updated value
    //crypted = cipher.final()

    // Printing the result...
    return (crypted)
}

  /*
  *  state_machine_lock - state machine controlling the steps through verification of pin code
  *
  */

async state_machine_lock (value){
      // STATE MACHINE - LOCK_STATE_PIN 
      switch (lockState[0])
      {
        case stateDevice.KEY_GENERATION:

            if (appState == stateApp.SERVICES_DISCOVERED) {
                // Request code from LOCK device
                // STEP 2.
                const buf = Buffer.alloc(1);
                buf[0] = 0x01;
                this.characteristics[1].write(buf);  // Confirm char
                appState = stateApp.PROXIMITY_TAG_CODE_REQUEST;
                this.log('App state: ', appState); 

            } else if (appState == stateApp.PROXIMITY_TAG_CODE_REQUEST) {
                // read randomcode from LOCK
                // STEP 3.1
                // randomCode = value; reading random value 
                // STEP 3.2 - Send ACK to LOCK
                const buf_new = Buffer.alloc(1);
                buf_new[0] = 0x00;
                this.characteristics[1].write(buf_new); // Confirm char
                appState = stateApp.PROXIMITY_TAG_CODE_ACK;
                this.log('App state: ', appState); 
            }
        break;

        case stateDevice.KEY_CONFIRMATION:

            if (appState == stateApp.PROXIMITY_TAG_CODE_ACK) {
                //STEP 4. case LOCK is FACTORY RESET and do not have a pincode
                //[self readRandomCode];
                appState == stateApp.PROXIMITY_TAG_READY_TO_PASS_PINCODE;
                // case we have a pincode - send pin code to be authenticated
                if(deviceHasPincode) {

                  const watchOverSomeoneDoingSomething = async () => {
                    const something = await this.PIN_ByteToByte()
                    return something
                  }
                  
                  watchOverSomeoneDoingSomething().then(res => {
                    this.characteristics[0].write(crypted)             // Key char
                    appState = stateApp.PROXIMITY_TAG_PINCODE_SEND
                    this.log('App state: ', appState)
                    this.log('Encrypted value: ', res)
                    this.setAvailable(true);
                  })
                
                }
            }
        break;

        case stateDevice.KEY_CHECKING:

            if (appState == stateApp.PROXIMITY_TAG_CODE_ACK)
            {
                appState = stateApp.PROXIMITY_TAG_READY_TO_PASS_PINCODE;

                // case we have a pincode - send pin code to be authenticated
                if(deviceHasPincode) {

                  const watchOverSomeoneDoingSomething = async () => {
                    const something = await this.PIN_ByteToByte()
                    return something
                  }
                  
                  watchOverSomeoneDoingSomething().then(res => {
                    this.characteristics[0].write(res)             // Key char - crypted
                    appState = stateApp.PROXIMITY_TAG_PINCODE_SEND
                    this.log('App state: ', appState)
                    this.log('Encrypted value: ', res)
                  })
                
                } else {
                    // Device has code, but not the app  - send code selected by user
                    // Save the pincode in the Device
                }
                this.setAvailable(true);
                appState = stateApp.PROXIMITY_TAG_PINCODE_SEND;
                this.log('App state: ', appState); 
            }

        break;

        case stateDevice.KEY_BLOCKING: // KEY BLOCKING mode - display a message to the user
        
        break;

        default:
            break;
    }
  }
}
module.exports = MyDevice;
