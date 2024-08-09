'use strict';

const Homey = require('homey');
//const DeviceApi = require('homey/lib/BlePeripheral');

class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MyApp has been initialized');

    if (process.env.DEBUG === '1')
    {
        require('inspector').open(9222, '0.0.0.0', true);
    }
  }

}
module.exports = MyApp;
