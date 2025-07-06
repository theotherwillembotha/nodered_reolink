import axios from "axios"
import { ReolinkDefaultClient } from "./ReolinkDefaultClient"
import ReolinkEncryptedClient from "././ReolinkEncryptedClient"
import { ReolinkClient } from "./ReolinkClient"

export class ReolinkAPI {

    private constructor(){}

    public static async connect(url: string, userName: string, password: string):Promise<ReolinkClient> {
        // first, we need to send out a probe to figure out if this particular implementation uses the encrypted API or not.
        // to do this, we will send a Login Request without any details.
        return Promise.resolve()
        .then(() => {
            let request = [{cmd:"Login",action:0,param:{Version:1}}]
            return axios.post<any>(`${url}/cgi-bin/api.cgi?cmd=Login`, request, {})
        })
        .then(result => {
            // if the authenticate header is supplied, switch to the encrypted Client.
            let client:Promise<ReolinkClient> = (result.headers["www-authenticate"])
                ? ReolinkEncryptedClient.connect(url, userName, password)
                : ReolinkDefaultClient.connect(url, userName, password);
            return client;
        })
    }

}


