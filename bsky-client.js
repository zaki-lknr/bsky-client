/**
 * Bluesky投稿クラス
 * 
 * @author zaki
 */
export class JpzBskyClient {
    bsky_id;
    bsky_pass;

    // last status
    last_status;

    message;
    // attach;
    image_files;
    image_urls = [];

    via = 'JpzBskyClient';

    use_corsproxy_getimage = false;
    use_corsproxy_getogp = false;

    /**
     * 
     * @param {string} Bluesky_ID
     * @param {string} Bluesky_AppPassword
     */
    constructor(id, pass) {
        this.bsky_id = id;
        this.bsky_pass = pass;
        this.useCorsProxyByGetImage = false;
        this.use_corsproxy_getogp = false;
    }

    /**
     * 
     * @returns バージョン番号
     */
    static getVersion() {
        return "0.1.0";
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
        this.image_urls.push(image_url);
        this.image_files = null;
    }
    /**
     * 添付画像設定
     * @param {blob} 添付画像Blob
     */
    setImageFiles(image_files) {
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

        const session = await this.#createSession();
        await this.#post_message(session);
    }

    async #createSession() {
        const url = "https://bsky.social/xrpc/com.atproto.server.createSession";
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
        return response;
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
    
        const url = "https://bsky.social/xrpc/com.atproto.repo.createRecord";
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
            for (const blob of image_blob) {
                body.record.embed.images.push(
                    {
                        image: blob,
                        alt: '',
                    }
                )
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
    
    
        const res = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: headers });
        this.last_status = res.status;
        console.log('posting... ' + res.status);
        if (!res.ok) {
            throw new Error(url + ': ' + await res.text());
        }
        // const response = await res.text();
        // console.log(response);
    }

    async #post_image(session) {
        const inputs = [];
        const resp_blob = [];
    
        if (this.image_files != null) {
            for (const image_file of this.image_files) {
                inputs.push({blob: image_file, type: image_file.type});
            }
        }
        else {
            for (const image_url of this.image_urls) {
                if (image_url.startsWith('http')) {
                    // get image
                    const url = (this.use_corsproxy_getimage)? 'https://corsproxy.io/?' + encodeURIComponent(image_url): image_url;
                    try {
                        const res_img = await fetch(url);
                        this.last_status = res.status;
                        if (!res_img.ok) {
                            throw new Error(url + ': ' + await res_img.text());
                        }
                        const image = await res_img.blob();
                        const buffer = await image.arrayBuffer();
                        inputs.push({blob: new Uint8Array(buffer), type: image.type});
                    }
                    catch(err) {
                        throw new Error('get image_url failed: ' + err + "\nurl: " + url);
                    }
                }
            }
        }
    
        const url = "https://bsky.social/xrpc/com.atproto.repo.uploadBlob";
        for (const item of inputs) {
            const headers = new Headers();
            headers.append('Authorization', "Bearer " + session.accessJwt);
            headers.append('Content-Type', item.type);
            
            const res = await fetch(url, { method: "POST", body: item.blob, headers: headers });
            this.last_status = res.status;
            if (!res.ok) {
                throw new Error('https://bsky.social/xrpc/com.atproto.repo.uploadBlob: ' + await res.text());
            }
            const res_json = await res.json()
            // console.log(res_json);
            resp_blob.push(res_json.blob);
            // return res_json.blob;
        }
        return resp_blob;
    }

    async #get_ogp(url) {
        const ogp_url = (this.use_corsproxy_getogp)? 'https://corsproxy.io/?' + encodeURIComponent(url): url;
        try {
            const res = await fetch(ogp_url);
            this.last_status = res.status;
            if (!res.ok) {
                throw new Error('https://corsproxy.io/?' + encodeURIComponent(url) + ': ' + await res.text());
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
                    }
                }
            }
            return ogp;
        }
        catch(err) {
            throw new Error('get ogp failed: ' + err + "\nurl: " + 'https://corsproxy.io/?' + encodeURIComponent(url));
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
