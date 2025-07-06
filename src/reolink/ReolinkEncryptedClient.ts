import axios from 'axios';
import md5 from 'md5';
import { ReolinkClient } from './ReolinkClient';

const crypto = require('../../lib/crypto-js');

export default class ReolinkEncryptedClient extends ReolinkClient {

    static connect(url:string, userName:string, password:string):Promise<ReolinkEncryptedClient>{
        let api:ReolinkEncryptedClient = new ReolinkEncryptedClient(url, userName, password);
        return api.login().then(() => api);
    }

    private decrypt!: (value:string) => string;
    private encrypt!: (value: string) => string;
    private token!: string;
    private sequenceCounters!:SequenceCounter[];

    private constructor(url:string, username:string, password:string){
        super(url, username, password);
    }

    private async login():Promise<void> {

        return Promise.resolve()
        // step 0: get Auth / Nonce and session config.
        .then(() => {
            let request = [{cmd:"Login",action:0,param:{Version:1}}]
            return axios.post(`${this.url()}/cgi-bin/api.cgi?cmd=Login`, request, {});
        })
        // step 1. parse the Auth / Nonce, setup the encryption and decryption functions and send the login request.
        .then(result => {
            let tmp:any = {};
            result.headers["www-authenticate"].toString()
                .replace("Digest ", "")
                .split(",")
                .forEach((val:string) => {
                    let [key, value] = val.trim().split("=");
                    value = value.substring(1, value.length -1);
                    tmp[key] = value;
                });
            
            let auth:Auth = tmp;
            let loops = 48;	                        // hardcoded
            let seed = "0123456789abcdef";	        // hardcoded
            let method = "POST";                    // matches the call that we are going to make.
            let uri = "cgi-bin/api.cgi?cmd=Login";  // matches the uri that we're going to call.
        
            let key = "";
            while (loops-- > 0){
                key += seed[Math.floor(Math.random() * seed.length)];
            }

            // WAT?!?
            let f = md5(this.username() + ":" + auth.realm + ":" + this.password());
            let _ = md5(method + ":" + uri);
            let v = md5(f + ":" + auth.nonce + ":" + auth.nc + ":" + key + ":" + auth.qop + ":" + _);
            let b = md5(auth.nonce + "-" + this.password() + "-" + key).slice(0, 16).toUpperCase();
            let w = md5("webapp-".concat(key, "-").concat(this.password(), "-").concat(auth.nonce, "-").concat(this.username())).slice(0, 16).toUpperCase();

            let cryptoCfg = {
                mode: crypto.mode.CFB, 
                padding: crypto.pad.ZeroPadding,
                iv: crypto.enc.Utf8.parse(w)
            }
            let aesKey = crypto.enc.Utf8.parse(b);

            // declare the decryption function
            this.decrypt = function(value) {
                var t = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
                if (!t) {
                    var n = crypto.enc.Base84.parse(value);
                    return n.toString(crypto.enc.Utf8)
                }
                if (!aesKey)
                    return "";
                var i = "";
                try {
                    var r = crypto.AES.decrypt(value, aesKey, cryptoCfg);
                    i = r.toString(crypto.enc.Utf8)
                } catch (error) {
                    console.error("ERROR:", error)
                }
                return i
            }

            // declare the encryption function
            this.encrypt = function(value) {
                var t = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1]
                , n = crypto.enc.Utf8.parse(value);
                if (!t)
                    return n.toString(crypto.enc.Base64);
                if (!aesKey)
                    throw new Error("aesKey is undefined");
                var i = crypto.AES.encrypt(n, aesKey, cryptoCfg);
                return i.ciphertext.toString(crypto.enc.Base64)
            }

            // compose the login request that has to be sent to the camera.
            let request = [{
                cmd:"Login",
                action:0,
                param:{
                    Version: 1,
                    Digest: {
                        UserName: this.username(),
                        Realm: auth.realm,
                        Method: method,
                        Uri: uri,
                        Nonce: auth.nonce,
                        Nc: auth.nc,
                        Cnonce: key,
                        Qop: auth.qop,
                        Response: v
                    }
                }
            }];

            return axios.post(`${this.url()}/cgi-bin/api.cgi?cmd=Login`, request, {});
        })
        // step 2. handle the login response and configure the counters.
        .then(response => {
            // if there was a login failure, the response payload will not be an object and not encrypted
            if(typeof response.data === "object"){
                throw new Error("Failed Logging into Reolink Device " +  JSON.stringify(response.data));
            }
            
            let loginResponse = JSON.parse(this.decrypt(response.data));
            this.token = loginResponse[0].value.Token.name;

            // create the sequence counters. Its some elemetary mechanism that tries to safeguard against replay attacks.
            this.sequenceCounters = [];
            for(let i = 0; i < loginResponse[0].value.Token.countTotal; i++){
                this.sequenceCounters.push({id:i, val: loginResponse[0].value.Token.checkBasic, free: true})
            }
        });
    }

    protected async sendRequest<ResponseType>(command:string, request:any, parse?:(value:{[key:string]:any}) => ResponseType):Promise<ResponseType>{
        // before sending a command...
        let availableSequenceCounters = this.sequenceCounters
        .filter(counter => counter.free)                                                // 1. Find all the free sequenceCounters.
        .filter(counter => counter.id !== 0 && counter.id !== 0 && counter.id !== 0)    // 2. Filter out the sequenceCoutners with ID 0,1,2

        // Pick a random value from the filtered sequenceCounters.
        let sequenceCounter = availableSequenceCounters[Math.floor(Math.random() * availableSequenceCounters.length)];
        // increate the selected sequenceCounter value by 1 and mark it as used.
        sequenceCounter.val++;
        // calculate the commandParams
        let commandParams = command ? ("&cmd=" + command) : "";
        // calculate the encryption tag.
        let encryptionTag = this.encrypt("countId=" + sequenceCounter.id + "&checkNum=" + sequenceCounter.val + commandParams);

        return axios.post(`${this.url()}/cgi-bin/api.cgi?token=${this.token}&encrypt=${encryptionTag}`, this.encrypt(JSON.stringify(request)))
        .then(response => {
            let parsedResponse = JSON.parse(this.decrypt(response.data)) as RequestResponse<ResponseType>[];
            try{
                // if there is no parser, take the first value.
                return (parse) 
                    ? parse(parsedResponse[0].value)
                    : Object.values(parsedResponse[0].value)[0];
            }
            catch(error){
                console.error("Error Parsing Response", error);
                console.error("Command", command, "Request", JSON.stringify(request));
                console.error("Response", JSON.stringify(parsedResponse));
                throw error;
            }
        })
    }

    protected async performGet<ResponseType>(command: string, request:{[key:string]:any}): Promise<ResponseType> {
        // before sending a command...
        let availableSequenceCounters = this.sequenceCounters
        .filter(counter => counter.free)                                                // 1. Find all the free sequenceCounters.
        .filter(counter => counter.id !== 0 && counter.id !== 0 && counter.id !== 0)    // 2. Filter out the sequenceCoutners with ID 0,1,2

        // Pick a random value from the filtered sequenceCounters.
        let sequenceCounter = availableSequenceCounters[Math.floor(Math.random() * availableSequenceCounters.length)];
        // increate the selected sequenceCounter value by 1 and mark it as used.
        sequenceCounter.val++;
        // calculate the commandParams
        let commandParams = command ? ("&cmd=" + command) : "";
        // calculate the request Params
        let requestParams = request ? ("&" + Object.entries(request).map(([key, value]) => `${key}=${value}`).join("&")) : "";
        // calculate the encryption tag.
        let encryptionTag = this.encrypt("countId=" + sequenceCounter.id + "&checkNum=" + sequenceCounter.val + commandParams + requestParams);
        return axios.get(`${this.url()}/cgi-bin/api.cgi?token=${this.token}&encrypt=${encryptionTag}`, { responseType: 'arraybuffer' })
        .then(response => {
            // it doesnt seem like GET responses are encrypted.
            return Buffer.from(response.data, 'binary') as any as ResponseType
        })
    }

    // ************************************ IMPLEMENTATION SPECIFIC FUNCTIONS ************************************ //

    public async getAIConfig():Promise<AiConfig>{
        return this.sendRequest("GetAiCfg", [{cmd:"GetAiCfg",action:0,param:{channel:0}}])
    }

    public async getMask():Promise<MaskConfig>{
        return this.sendRequest("GetMask", [{cmd:"GetMask",action:0,param:{channel:0,iLogicChannel:0}}])
    }

    public async getNetworkPort():Promise<NetPortInfo>{
        return this.sendRequest("GetNetPort", [{cmd:"GetNetPort",action:0,param:{}}])
    }

    public async getLocalLink():Promise<LocalLinkInfo>{
        return this.sendRequest("GetLocalLink", [{cmd:"GetLocalLink",action:0,param:{}}])
    }

    public async getOSD():Promise<OSDInfo>{
        return this.sendRequest("GetOsd", [{cmd:"GetOsd",action:1,param:{channel:0}}])
    }

    public async getEncoding():Promise<EncodingInfo>{
        return this.sendRequest("GetEnc", [{cmd:"GetEnc",action:1,param:{channel:0}}])
    }

    public async getImageInfo():Promise<ImageInfo>{
        return this.sendRequest("GetImage", [{cmd:"GetImage",action:1,param:{channel:0}}])
    }

    public async getImageSensorPrpoerties():Promise<ImageSensorProperties>{
        return this.sendRequest("GetIsp", [{cmd:"GetIsp",action:1,param:{channel:0}}])
    }
}

//'[{"cmd":"SetWebHook","action":0,"param":{"WebHook":{"channel":0,"index":1,"indexEnable":1,"hookUrl":"http://192.168.1.12:6644/test1","bCustom":0,"hookBody":""}}}]'
// [{"cmd":"SetWebhook","action":0,"param":{"WebHook":{"channel":0,"index":1,"indexEnable":1,"hookUrl":"http://192.168.1.12:6644/test1","bCustom":0,"hookBody":""}}}]


enum ColorBalanceMode {
    Auto,
    Manual
}

interface ColorBalanceInfo {
    bright: number,
    dark: number,
    mode: ColorBalanceMode
}

interface ImageSensorProperties {
    antiFlicker: string,
    backLight: string,
    bd_day: ColorBalanceInfo
    bd_led_color: ColorBalanceInfo
    blc: number,
    blueGain: number,
    redGain: number,
    channel: number,
    constantFrameRate: number,
    dayNight: string,
    dayNightThreshold: number,
    drc: number,
    encType: string,
    exposure: string,
    gain: {
        max: number,
        min: number,
    },
    hdr: number,            // 0 = disabled, 1 = enabled
    mirroring: number,      // 0 = disabled, 1 = enabled
    nr3d: number,           // 0 = disabled, 1 = enabled
    rotation: number,
    shutter: {
        max: number,
        min: number,
    },
    whiteBalance: string
}

interface ImageInfo {
    bright: number,
    channel: number,
    contrast: number,
    hue: number,
    saturation: number,
    sharpen: number
}

enum VideoType{
    h264 = "h264",
    h265 = "h265"
}

interface ChannelInfo {
    bitRate: number,
    frameRate: number,
    gop: number,
    height: number,
    profile: string,
    size: string,
    vType: VideoType,
    width: number
}

interface EncodingInfo {
    audio: 1,
    channel: 0,
    mainStream: ChannelInfo,
    subStream:ChannelInfo
}

enum Position {
    "Upper Left",
    "Top Center",
    "Upper Right",
    "Lower Left",
    "Bottom Center",
    "Lower Right"
}

interface OSDInfo {
    bgcolor: 0,
    channel: 0,
    osdChannel: {
        enable: number,             // 0 = disabled 1 = enabled
        name: string,
        pos: Position
    },
    osdTime: {
        enable: number,             // 0 = disabled 1 = enabled
        pos: Position
    },
    watermark: number               // 0 = disabled 1 = enabled
}

interface LocalLinkInfo {
    activeLink:string           // LAN - use lan connection.
    dns: {
      auto:number,              // 0 = disabled 1 = enabled
      dns1: string,
      dns2: string
    },
    mac: string,
    static: {
      gateway: string,
      ip: string,
      mask: string
    },
    type:string                 // DHCP = uses DHCP allocated Ip address
}

interface NetPortInfo {
    httpEnable:number   // 0 = disabled 1 = enabled
    httpPort:number     // default 80,
    httpsEnable:number  // 0 = disabled 1 = enabled
    httpsPort:number    // default 443,
    mediaPort:number    // default 9000,
    onvifEnable:number  // 0 = disabled 1 = enabled
    onvifPort:number    // default 8000,
    rtmpEnable:number   // 0 = disabled 1 = enabled
    rtmpPort:number     // default 1935,
    rtspEnable:number   // 0 = disabled 1 = enabled
    rtspPort:number     // default 554
}



interface AiConfig{
    dog_cat: number,    // 0 = not supported, 1 = supported
    face: number,       // 0 = not supported, 1 = supported
    people: number,     // 0 = not supported, 1 = supported
    vehicle: number     // 0 = not supported, 1 = supported
}

interface MaskConfig{
    area: any,          // TODO: Configure a mask on the camera!
    channel: number,    
    enable: number,     // 0 = disabled, 1 = enabled
}

// *NTERNAL TYPES */
interface Auth{
    realm:string, 
    nonce:string, 
    nc:string, 
    qop:string
}

interface SequenceCounter {
    id:number,
    val:number,
    free:true
}

interface RequestResponse<ResponseType> {
    cmd:string,
    code:number,
    value:{
        [key:string]:ResponseType
    }
}