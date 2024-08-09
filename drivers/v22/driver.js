'use strict';

const {Driver} = require('homey')

class MyDriver extends Driver{

  static DISCOVER_INTERVAL = 1000 * 60 * 1; // 1 minute

  DISCOVERY_SERVICE_UUID() { 
    return 'b1de152885ef37cc00c8a3cf3412a548'
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {

    this.mypin1 = this.homey.settings.get('mypin1');
    this.mypin2 = this.homey.settings.get('mypin2');
    this.mypin3 = this.homey.settings.get('mypin3');
    this.mypin4 = this.homey.settings.get('mypin4');
    this.mypin5 = this.homey.settings.get('mypin5');

    // array to save Secuyou discovered devices
    this.advertisements = {};

    const card_arm = this.homey.flow.getActionCard('arm');
    card_arm.registerRunListener(async (args) => {
          await args.device.arm()
    });

    const card_disarm = this.homey.flow.getActionCard('disarm');
    card_disarm.registerRunListener(async (args) => {
        await args.device.disarm()
    });

    const card_lock = this.homey.flow.getActionCard('lock');
    card_lock.registerRunListener(async (args) => {
        await args.device.lock()
    });

    const card_unlock = this.homey.flow.getActionCard('unlock');
    card_unlock.registerRunListener(async (args) => {
        await args.device.unlock()
    });

    this.log('Secuyou Lock Driver has been initialized');

    const Homey = require("homey");
  }

  async onPair(session) {

    session.setHandler('list_devices', async () => {
      //const advertisements = await this.homey.ble.discover([this.DISCOVERY_SERVICE_UUID()]).catch(this.error);
      var advertisements = await this.homey.ble.discover().catch(this.error);

      this.log(`Found ${advertisements.length} devices.`)
      //const buf1 = Buffer.from('d402', 'utf-8');
      advertisements.forEach(advertisement => {
            
            this.log('Lock found - manuID:  ', advertisement.manufacturerData)
            
      })


    return advertisements
      //.filter(advertisement => advertisement.manufacturerData[0] == 0xd4 && advertisement.manufacturerData[1] == 0x02) // 02D4
      //.filter(advertisement => advertisement.manufacturerData.compare(buf1)) // 02D4
      .map(advertisement => {
        return {
          name: advertisement.localName,
          data: {
            id: advertisement.uuid,
          },
          store: {
            peripheralUuid: advertisement.uuid,
          }
        };
      });
    });


    session.setHandler('list_devices_selection', async (data) => {
        // User selected a device so cache the information required to validate it when the credentials are set
        this.log("list_devices_selection: ", data)

        return;
    });

    session.setHandler('manual_connection', async (data) =>
    {
        this.convertPincode(data)
        // Read the pin code from UI
        //this.log("Returned data is: ", data/1000);

    });

    // Received when a view has changed
    session.setHandler("showView", async function (viewId) {
      this.log("View: " + viewId);
    });

  }

  async onDiscover() {
    // Use peripheral address in stead of service UUID
    this.log('Discovering...');
   
    const advertisements = await this.homey.ble.discover();
  }

  getValue(stringposition){
    if (stringposition == 'first'){
      return this.mypin1
    }
    else if (stringposition == 'second'){
      return this.mypin2
    }
    else if (stringposition == 'third'){
      return this.mypin3
    }
    else if (stringposition == 'fourth'){
      return this.mypin4
    }
    else if (stringposition == 'fifth'){
      return this.mypin5
    }
  }

  convertPincode (value) {
    this.log('Convertdata')
    let stringvalue = value.toString()

    // splits every letter in string into an item in our array
    let newArray = stringvalue.split('')

    // convert char to int
    this.mypin1 = Number(newArray[0])
    this.mypin2 = Number(newArray[1])
    this.mypin3 = Number(newArray[2])
    this.mypin4 = Number(newArray[3])
    this.mypin5 = Number(newArray[4])
    
    this.log('mypin1: ',this.mypin1)
    this.log('mypin2: ',this.mypin2)
    this.log('mypin3: ',this.mypin3)
    this.log('mypin4: ',this.mypin4)
    this.log('mypin5: ',this.mypin5)

    // Saving it to SETTINGS 

    this.homey.settings.set('mypin1', this.mypin1);
    this.homey.settings.set('mypin2', this.mypin2);
    this.homey.settings.set('mypin3', this.mypin3);
    this.homey.settings.set('mypin4', this.mypin4);
    this.homey.settings.set('mypin5', this.mypin5);
  }

}
module.exports = MyDriver;
