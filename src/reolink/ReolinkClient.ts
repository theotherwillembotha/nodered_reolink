export abstract class ReolinkClient {
    
    private _url: string
    private _username: string
    private _password: string
    
    protected constructor(url:string, username:string, password:string){
        this._url = url;
        this._username = username;
        this._password = password;
    }

    public close() {
    }

    protected url():string { return this._url; }
    protected username():string{ return this._username; }
    protected password():string{ return this._password; }

    protected abstract sendRequest<ResponseType>(command:string, request:any, parse?:(value:{[key:string]:any}) => ResponseType):Promise<ResponseType>;
    protected abstract performGet<ResponseType>(command:string, request:any):Promise<ResponseType>;


    public async getDeviceInfo():Promise<DeviceInfo>{
        return this.sendRequest<DeviceInfo>("GetDevInfo", [{cmd:"GetDevInfo",action:0,param:{}}])
    }

    public async getAbility():Promise<AbilityInfo>{
        return this.sendRequest<RawAbilityInfo>("GetAbility", [{cmd:"GetAbility",action:0,param:{User:{userName:this.username()}}}])
            .then(ability => parseAbility(ability));
    }

    public async getDeviceName(channelNumber:number = 0):Promise<string>{
        return this.sendRequest<{name:string}>("GetDevName", [{cmd:"GetDevName",action:0,param: { channel:channelNumber}}]).then(n =>n.name);
    }

    public async getChannelStatus():Promise<ChannelStatus[]>{
        return this.sendRequest<any>("GetChannelstatus", [{cmd:"GetChannelstatus",action:0,param:{}}], (value) => value.status)
    }

    public async getUsers():Promise<UserInfo[]>{
        return this.sendRequest("GetUser", [{cmd:"GetUser",action:0,param:{}}])
    }

    public async getWebhooks():Promise<WebhookConfig[]>{
        return this.sendRequest("GetWebHook", [{cmd:"GetWebHook",action:1,param:{channel:0}}])
    }

    public async testWebhook(test:WebhookTest):Promise<Info>{
        return this.sendRequest("TestWebHook", [{cmd:"TestWebHook",action:0,param:{WebHook:{
            alarmChannel:0,
            type:3,
            source:"hook",
            hookUrl:test.url,
            bCustom:0,
            hookBody: test.hookBody
        }}}])
    }

    public async setWebhook(webhookConfig:WebhookConfig):Promise<Info>{
        return this.sendRequest("SetWebHook", [{cmd:"SetWebhook",action:0,param:{WebHook:webhookConfig}}])
    }

    public async getWhiteLED():Promise<WhiteLEDConfig>{
        return this.sendRequest<WhiteLEDConfig>("GetWhiteLed", [{cmd:"GetWhiteLed",action:0,param:{channel:0}}])
    }

    public async setWhiteLED(config:WhiteLEDConfig):Promise<void>{
        return this.sendRequest<number>("SetWhiteLed", [{cmd:"SetWhiteLed",action:0,param:{WhiteLed:config}}])
        .then(code => {
            if(code !== 200){
                throw new Error("failed applying command");
            }
        })
    }

    public async setSiren(config:SirenConfig):Promise<number>{
        return this.sendRequest<number>("AudioAlarmPlay", [{cmd:"AudioAlarmPlay",action:0,param:config}])
        .then(code => {
            if(code !== 200){
                throw new Error("failed applying command");
            }
            return code;
        })
    }

    public async getP2PId():Promise<P2PId> {
        return this.sendRequest<P2PId>("GetP2p", [{cmd:"GetP2p",action:0,param:{channel:0}}])
    }

    public async snapImage(channel:number = 0):Promise<Buffer> {
        return this.performGet("Snap", {channel:channel, snapType:"ext"});
    }
}

interface Info{

}

export type P2PId = {
    enable : number,    // 1 = enabled. 0 = disabled.
    uid : string,       // matches up with the uid that is provided on NVR channels.
}

export type ChannelStatus = {
    channel: number, 
    name: string, 
    online: number,      // 1 = online. 0 = offline / unconfigured
    typeInfo: string,    // model number.
    // NVR only
    sleep?: number,       // 1 = device sleep. 0 = device awake (presumably this is for wifi cameras connected to NVR)
    uid?: string,         // camera serial.
}

export interface RawAbilityInfo {
    // contains a lot of values and parameters. we can use it to determine 
    // the capabilities of the device. see function: parseAbility and AbilityInfo for more information.
    abilityChn:{[key:string]:{permit:number, ver:number}}[]    // contians an array of the channel abilities (1 for each camera, or 1 for each camera attached to an NVR)
}

export enum DeviceType{
    NVR = "NVR",
    IPC = "IPC"
}

export type DeviceInfo = {
    name: string,       // the name of the device.
    model: string,      // Known Models: RLN36, RLC-520, CX810
    type:DeviceType,    // IPC - IP Camera, NVR - network video recorder
    channelNum:number   // the number of cameras on this device (eg NVRs have several. tackmix has 2, etc, etc)
    serial: string,     // the device serial number.
}

export type ExtendedDeviceInfo = DeviceInfo & {
    B485: number,            // 0 - not a B485 camera. 1 - this is a B485 camera
    IOInputNum: number,
    IOOutputNum: number,
    audioNum: number,
    buildDay: string,
    cfgVer: string,
    detail: string,
    diskNum: number,
    exactType: string,
    firmVer: string,
    frameworkVer: number,
    hardVer: string,
    itemNo: string,
    pakSuffix: string,
    wifi:number         // 0 - not avaialable, 1 - available
}

export enum UserLevel {
    admin = "admin",
    guest = "guest"
}

export interface UserInfo {
    level:string,
    userName:UserLevel
}

export interface ChannelInfo {
    sirenSupport:boolean;
    webhookSupport:boolean;
    ledLightSupport:boolean;
}

export interface AbilityInfo {
    channels:ChannelInfo[]

}

export interface WebhookTest {
    url:string,         // the url that the webhook is testing against.
    hookBody:string     // a base64 encoded string containing the payload that should be sent.
}

export interface WebhookConfig {
    bCustom: number,    // 0 - use default message. 1 use custom message.
    hookBody: string,   // a Base64 encoded string containing the custom mesage.
    hookUrl: string,    // the URL for the webhook
    index: number,      // the id of the webhook (between 0 and 3)
    indexEnable: number // 1 if the webhook is enabled, 0 if its disabled, -1 if its not rendered
    channel: number     // not populated when getting the webhookconfig, but has to be provided when setting the webhook. default:0
}

function parseAbility(ability: RawAbilityInfo): AbilityInfo {
    return {
        channels: ability.abilityChn.map(channel => { 
            return {
                sirenSupport: (channel.alarmAudio) ? (channel.alarmAudio.permit > 0) : false,
                webhookSupport: (channel.supportWebhook) ? (channel.supportWebhook.permit > 0) : false,
                ledLightSupport: (channel.supportWLLightAlarm) ? (channel.supportWLLightAlarm.permit > 0):false,
            }})
    };
}

export interface WhiteLEDConfig {
    LightingSchedule:{EndHour:number,EndMin:number,StartHour:number,StartMin:number},
    LightAlarm:{EndHour:number,EndMin:number,StartHour:number,StartMin:number},
    bright:number,
    mode:number,            // 0 = off, 3 = Timer Mode, 4 = smart mode, 5 = auto mode
    channel:number,
    state: number           // 0 - light off, 1 - light on.
    wlAiDetectType:{ 
        people:number,      // 0 = disabled, 1 = enabled
        vehicle:number,     // 0 = disabled, 1 = enabled
        dog_cat:number      // 0 = disabled, 1 = enabled
    }
}

export interface SirenConfig {
    alarm_mode: string,         // default: "manul"
    manual_switch:number,       // 0 = off, 1 = on 
    channel:number              // the channel that this device is bound to.
}