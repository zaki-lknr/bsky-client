/**
 * Bluesky投稿クラス
 * 
 * @author zaki
 */
class JpzBskyClient {
    bsky_id;
    bsky_pass;
    bsky_pds;

    // last status
    last_status;

    message;

    // attach;
    // 型が違うため4枚目制限の処理タイミングが異なる
    // url: set時
    // file: 送信時
    image_files;
    image_urls = [];

    image_aspect = [];

    via = 'JpzBskyClient';

    use_corsproxy_getimage = false;
    use_corsproxy_getogp = false;

    // リフレッシュトークン
    refresh_jwt;

    // 進捗のコールバック
    progress_callback;

    /**
     * 
     * @param {string} Bluesky_ID
     * @param {string} Bluesky_AppPassword
     * @param {string} PDS_Server
     */
    constructor(id, pass, pds) {
        this.bsky_id = id;
        this.bsky_pass = pass;
        this.useCorsProxyByGetImage = false;
        this.use_corsproxy_getogp = false;
        if (pds) {
            console.log(pds);
            this.bsky_pds = pds;
        }
        else {
            console.log('bsky.social');
            this.bsky_pds = "bsky.social";
        }
    }

    /**
     * 
     * @returns リフレッシュトークン
     */
    getRereshJwt() {
        return this.refresh_jwt;
    }

    /**
     * 
     * @param {string} リフレッシュトークン
     */
    setRefreshJwt(refresh_jwt) {
        this.refresh_jwt = refresh_jwt;
    }

    /**
     * @param {*} コールバック関数
     */
    setProgressCallback(progress_callback) {
        this.progress_callback = progress_callback;
    }

    #notifyProgress(message) {
        if (this.progress_callback) this.progress_callback(message);
    }

    /**
     * 
     * @returns バージョン番号
     */
    static getVersion() {
        return "0.6.3";
    }

    /**
     * @returns 最後に実行したHTTPアクセスのステータスコード
     */
    getLastErrCode() {
        return this.last_status;
    }

    /**
     * 添付画像設定
     * @param {string} 添付画像のURL
     */
    setImageUrl(image_url) {
        if (this.image_urls.length < 4) {
            this.image_urls.push(image_url);
        }
        this.image_files = null;
    }
    /**
     * 添付画像設定
     * @param {blob} 添付画像Blob
     */
    setImageFiles(image_files) {
        // this.image_files = image_files.slice(0,4);  // 配列じゃないので不可
        this.image_files = image_files;
        this.image_urls.splice(0);
    }

    enableCorsProxyAtGetImage(useCorsProxy = false) {
        this.use_corsproxy_getimage = useCorsProxy;
    }
    /**
     * OGP情報取得時にCorsProxyを使用する設定
     * @param {boolean} useCorsProxy 
     */
    enableCorsProxyAtOgp(useCorsProxy = false) {
        this.use_corsproxy_getogp = useCorsProxy;
    }

    /**
     * クライアント名設定
     * @param {string} クライアント名
     */
    setClientVia(via) {
        this.via = via;
    }

    /**
     * 投稿処理
     * @param {string} 投稿文字列
     */
    async post(message) {
        this.message = message;
        // if (attach) {
        //     this.attach = attach;
        // }

        const session = await this.#getSession();

        // const last_session = {
        //     accessJwt: "",
        //     refreshJwt: ""
        // }
        // const session = await this.#refreshSession(last_session);

        await this.#post_message(session);
    }

    async #getSession() {
        if (this.refresh_jwt) {
            // available refreshtoken
            // console.log("refresh_jwt exist");
            const session = await this.#refreshSession(this.refresh_jwt);
            if (session) {
                // console.log("refresh session success");
                return session;
            }
            // リフレッシュトークンでセッション作れなかったらcreateSessionする
        }

        console.log("create session");
        return await this.#createSession();
    }

    async #createSession() {
        this.#notifyProgress("createSession");

        const url = "https://" + this.bsky_pds + "/xrpc/com.atproto.server.createSession";
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
    
        const body = JSON.stringify({
            identifier: this.bsky_id,
            password: this.bsky_pass
        });
    
        const res = await fetch(url, { method: "POST", body: body, headers: headers });
        this.last_status = res.status;
        if (!res.ok) {
            throw new Error('com.atproto.server.createSession failed: ' + await res.text());
        }
    
        const response = await res.json();
        this.refresh_jwt = response.refreshJwt;
        this.#notifyProgress(null);
        // console.log(this.refresh_jwt);
        return response;
    }

    async #refreshSession(refresh_jwt) {
        this.#notifyProgress("refreshSession");
        const url = "https://" + this.bsky_pds + "/xrpc/com.atproto.server.refreshSession";
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Authorization', "Bearer " + refresh_jwt);
        const res = await fetch(url, { method: "POST", headers: headers });
        this.last_status = res.status;
        // console.log(this.last_status);
        switch (this.last_status) {
            case 200:
                const response = await res.json();
                // console.log(response);
                this.#notifyProgress(null);
                return response;
            case 400:
            case 401:
                // expiredは400になる。既定のエラー時は全部createさせる
                // https://docs.bsky.app/docs/api/com-atproto-server-refresh-session
                this.#notifyProgress(null);
                return null;
            default:
                throw new Error(url + ' failed: ' + await res.text());
        }
    }

    async deleteSession() {
        if (this.refresh_jwt) {
            this.#notifyProgress("deleteSession");
            // console.log("delete session start");
            const url = "https://" + this.bsky_pds + "/xrpc/com.atproto.server.deleteSession";
            const headers = new Headers();
            headers.append('Authorization', "Bearer " + this.refresh_jwt);
            const res = await fetch(url, { method: "POST", headers: headers });
            this.last_status = res.status;
            // console.log(this.last_status);
            if (!res.ok) {
                throw new Error(url + ' failed: ' + await res.text());
            }
            this.refresh_jwt = null;
            this.#notifyProgress(null);
        }
    }

    async #post_message(session) {
        // リンクを含むか確認
        const url_objs = this.#search_url_pos(this.message);
        // console.log(url_objs);
        const update_msg = (url_objs != null)? url_objs[0].disp_message: this.message;
    
        // 添付画像URL
        let image_blob = null;
        let ogp = null;
        if (this.image_files != null) {
            image_blob = await this.#post_image(session);
        }
        else if (this.image_urls.length) {
            image_blob = await this.#post_image(session);
        }
        else if (url_objs != null) {
            // 添付画像はないけどURLがある場合
            ogp = await this.#get_ogp(url_objs[0].url);
            if (ogp['og:image']) {
                this.image_urls.push(ogp['og:image']);
                image_blob = await this.#post_image(session);
            }
        }
    
        const url = "https://" + this.bsky_pds + "/xrpc/com.atproto.repo.createRecord";
        const headers = new Headers();
        headers.append('Authorization', "Bearer " + session.accessJwt);
        headers.append('Content-Type', 'application/json');
    
        const body = {
            repo: this.bsky_id,
            collection: "app.bsky.feed.post",
            record: {
                text: update_msg,
                createdAt: new Date().toISOString(),
                $type: "app.bsky.feed.post",
                facets: [],
                via: this.via,
            }
        };
    
        if (image_blob != null) {
            // 画像指定あり
            body.record.embed = {
                $type: "app.bsky.embed.images",
                images: [],
            }
            let index = 0;
            for (const blob of image_blob) {
                // console.log(blob);
                body.record.embed.images.push(
                    {
                        image: blob,
                        alt: '',
                        aspectRatio: {
                            width: this.image_aspect[index].width,
                            height: this.image_aspect[index].height
                        }
                    }
                )
                index++;
            }
        }
    
        if (url_objs != null) {
            // リンクあり
            body.record.facets = [];
            for (const item of url_objs) {
                const facet = {
                    index: {
                        byteStart: item.start,
                        byteEnd: item.end,
                    },
                    features: [{
                        $type: 'app.bsky.richtext.facet#link',
                        uri: item.url
                    }]
                }
                body.record.facets.push(facet);
            }
    
            if (ogp != null) {
                // OGP情報があればその内容を表示
                body.record.embed = {
                    $type: "app.bsky.embed.external",
                    external: {
                        uri: url_objs[0].url,
                        title: ogp['title'],
                        description: ogp['og:description'] || "",
                    }
                }
                if (image_blob) {
                    // 画像がある場合のみ追加 (無い場合は省略)
                    body.record.embed.external.thumb = image_blob[0];
                }
            }
        }
        // console.log(body);
        const f = this.#get_tw_accounts_facets(this.message);
        // console.log(f);
        body.record.facets.push(...f);

        const mentions = await this.#get_mentions_facets(this.message);
        // console.log(mentions);
        body.record.facets.push(...mentions);

        const tags = this.#search_tag_pos(update_msg);
        if (tags != null) {
            for (const tag of tags) {
                // hashtagがある場合
                body.record.facets.push({
                    index: {
                        byteStart: tag.start,
                        byteEnd: tag.end
                    },
                    features: [{
                        $type: 'app.bsky.richtext.facet#tag',
                        tag: tag.tag.replace(/^#/, ''),
                    }]
                });
            }
        }
    
        this.#notifyProgress("createRecord");
        const res = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: headers });
        this.last_status = res.status;
        console.log('posting... ' + res.status);
        if (!res.ok) {
            throw new Error(url + ': ' + await res.text());
        }
        this.#notifyProgress(null);
        // const response = await res.text();
        // console.log(response);
    }

    #get_image_aspect(image_blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = image_blob;
            img.onload = () => {
                // console.log(img.width);
                // console.log(img.height);
                resolve(img);
            }
            img.onerror = (e) => reject(e);
        })
    }

    async #post_image(session) {
        const inputs = [];
        const resp_blob = [];
        let count = 0;

        // アスペクト情報のクリア
        this.image_aspect.splice(0);
    
        if (this.image_files != null) {
            // console.log("image files");
            // console.log(typeof(this.image_files));
            for (const image_file of this.image_files) {
                if (++count > 4) { console.log("ignore more than 4 elements"); break; } // 4ファイル以上は無視
                inputs.push({blob: image_file, type: image_file.type});
                const r = await this.#get_image_aspect(URL.createObjectURL(image_file));
                // console.log(r.width);
                // console.log(r.height);
                this.image_aspect.push({width: r.width, height: r.height});
            }
        }
        else {
            this.#notifyProgress("get image file from remote");
            for (const image_url of this.image_urls) {
                if (image_url.startsWith('http')) {
                    // get image
                    const url = (this.use_corsproxy_getimage)? 'https://corsproxy.io/?url=' + encodeURIComponent(image_url): image_url;
                    try {
                        const res_img = await fetch(url);
                        this.last_status = res_img.status;
                        if (!res_img.ok) {
                            throw new Error(url + ': ' + await res_img.text());
                        }
                        const image = await res_img.blob();
                        const buffer = await image.arrayBuffer();
                        inputs.push({blob: new Uint8Array(buffer), type: image.type});
                        const r = await this.#get_image_aspect(image_url);
                        // console.log(r.width);
                        // console.log(r.height);
                        this.image_aspect.push({width: r.width, height: r.height});
                    }
                    catch(err) {
                        throw new Error('get image_url failed: ' + err + "\nurl: " + url);
                    }
                }
            }
            this.#notifyProgress(null);
        }
    
        const url = "https://" + this.bsky_pds + "/xrpc/com.atproto.repo.uploadBlob";
        this.#notifyProgress("uploadBlob");
        for (const item of inputs) {
            const headers = new Headers();
            headers.append('Authorization', "Bearer " + session.accessJwt);
            headers.append('Content-Type', item.type);
            
            const res = await fetch(url, { method: "POST", body: item.blob, headers: headers });
            this.last_status = res.status;
            if (!res.ok) {
                throw new Error('https://' + this.bsky_pds + '/xrpc/com.atproto.repo.uploadBlob: ' + await res.text());
            }
            const res_json = await res.json()
            // console.log(res_json);
            resp_blob.push(res_json.blob);
            // return res_json.blob;
        }
        this.#notifyProgress(null);
        return resp_blob;
    }

    async #get_ogp(url) {
        const ogp_url = (this.use_corsproxy_getogp)? 'https://corsproxy.io/?url=' + encodeURIComponent(url): url;
        // console.log("ogp_url: " + ogp_url);
        try {
            this.#notifyProgress("get ogp info");
            const res = await fetch(ogp_url);
            this.last_status = res.status;
            if (!res.ok) {
                throw new Error('https://corsproxy.io/?url=' + encodeURIComponent(url) + ': ' + await res.text());
            }
            const t = await res.text();
            const d = new DOMParser().parseFromString(t, "text/html");
            const ogp = {title: d.title};

            for (const child of d.head.children) {
                if (child.tagName === 'META') {
                    switch (child.getAttribute('property')) {
                        case 'og:description':
                        case 'og:image':
                        case 'og:title':
                            // console.log(child.getAttribute('property') + ': ' + child.getAttribute('content'));
                            ogp[child.getAttribute('property')] = child.getAttribute('content');
                            break;
                        // default:
                        //     console.log("etc: " + child.getAttribute('property') + ': ' + child.getAttribute('content'))
                    }
                }
            }
            this.#notifyProgress(null);
            return ogp;
        }
        catch(err) {
            throw new Error('get ogp failed: ' + err + "\nurl: " + 'https://corsproxy.io/?url=' + encodeURIComponent(url));
        }
    }

    #search_url_pos(message, start_pos = 0) {
        // const url_pos = message.indexOf('http');
        const url_pos = message.search('https?://');
        if (url_pos < 0) {
            return null;
        }
        // バイトサイズの位置に変換
        const byte_pos = new Blob([message.substring(0,url_pos)]).size;
        // URL文字列長取得
        const match = message.match('https?://[a-zA-Z0-9/:%#\$&\?\(\)~\.=\+\-_]+');
        // console.log(match);
    
        // 長いURLを短縮
        const url_obj = new URL(match[0]);
        let disp_url = url_obj.href;
    
        // const short = {};
        if (url_obj.href.length - url_obj.origin.length > 15) {
            disp_url = url_obj.href.substring(0, url_obj.origin.length + 15) + '...';
        }
    
        const remain = message.substring(url_pos + url_obj.href.length);
        const next = this.#search_url_pos(remain, byte_pos + disp_url.length + start_pos);
        const disp_message = message.substring(0, url_pos) + disp_url + ((next!=null)? next[0].disp_message: message.substring(url_pos + url_obj.href.length));
    
        const results = [{
            start: byte_pos + start_pos,
            end: byte_pos + disp_url.length + start_pos,
            url: url_obj.href,
            disp_url: disp_url,
            disp_message: disp_message,
        }]
        if (next != null) {
            results.push(...next);
        }
        return results;
    }

    /**
     * メンション処理
     * @param {string} 投稿テキスト本文
     * @returns
     */
    async #get_mentions_facets(message) {
        const result = [];
        // ドメイン名を拾う
        const regex = RegExp(/\@([\w\d][\w\d\-]*[\w\d]*\.)+[\w]{2,}/, 'g');
        let e;
        this.#notifyProgress("resolveHandle"); //fixme: 必ず通る
        while (e = regex.exec(message)) {
            let did;
            const account = message.substring(e.index, e.index + e[0].length);
            // result.push(account);
            const url = "https://" + this.bsky_pds + "/xrpc/com.atproto.identity.resolveHandle?handle=" + account.replace(/@/, '');
            const resp = await fetch(url);
            this.last_status = resp.status;
            if (resp.status === 400) {
                // 独自PDSのアカウント問い合わせはこのRESTだと失敗してしまう。
                // その場合は https://<PDSのアカウントID>/.well-known/atproto-did にあるファイルを参照する。
                try {
                    const _resolve_url = 'https://' + account.replace(/@/, '') + '/.well-known/atproto-did'
                    const _url = 'https://corsproxy.io/?url=' + encodeURIComponent(_resolve_url);
                    const _resp = await fetch(_url);
                    this.last_status = _resp.status;
                    if (this.last_status === 200) {
                        const _rb = await _resp.text();
                        // console.log('id: ' + _rb);
                        if (_rb.startsWith('did:plc:')) {
                            // didの形式であれば使用する
                            did = _rb;
                        }
                        else {
                            continue;
                        }
                    }
                    else {
                        continue;
                    }
                }
                catch(e) {
                    continue;
                }
            }
            else if (!resp.ok) {
                throw new Error(url + ': ' + await resp.text());
            }
            else {
                const json = await resp.json();
                did = json.did;
            }
            // バイトサイズの位置に変換
            const start_pos_b = new Blob([message.substring(0, e.index)]).size;
            const end_pos_b = new Blob([message.substring(0, e.index + e[0].length)]).size;
            // result.push(account);
            result.push({
                index: {
                    byteStart: start_pos_b,
                    byteEnd: end_pos_b,
                },
                features: [{
                    $type: 'app.bsky.richtext.facet#mention',
                    did: did
                }]
            });
        }
        this.#notifyProgress(null);
        return result;
    }

    #get_tw_accounts_facets(message) {
        const result = [];
        const regex = RegExp(/\@[_a-zA-Z0-9]+(?=($|\s|,|\. ))/, 'g');
        let e;
        while (e = regex.exec(message)) {
            const account = message.substring(e.index, e.index + e[0].length);
            const url = 'https://x.com/' + account.replace(/@/, '');
            const f = this.#get_url_facet(message, account, url);
            result.push(f);
        }
        return result;
    }
    
    #get_url_facet(message, substring, url) {
        const pos = message.search(substring);
        // バイトサイズの位置に変換
        const start_pos_b = new Blob([message.substring(0, pos)]).size;
        const end_pos_b = new Blob([substring]).size;
    
        const facet = {
            index: {
                byteStart: start_pos_b,
                byteEnd: start_pos_b + end_pos_b,
            },
            features: [{
                $type: 'app.bsky.richtext.facet#link',
                uri: url
            }]
        }
        return facet;
    }

    #search_tag_pos(message) {
        const result = [];
        const regex = RegExp(/\#\S+/, 'g');
        let e;
        while (e = regex.exec(message)) {
            const tag = message.substring(e.index, e.index + e[0].length);
            const start = new Blob([message.substring(0, e.index)]).size;
            const end = start + new Blob([tag]).size;
            const item = {
                start: start,
                end: end,
                tag: tag,
            }
            result.push(item);
        }
        return result;
    }

}
