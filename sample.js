import {JpzBskyClient} from "./bsky-client.js";

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById('btn_save').addEventListener('click', ()=> {
        save_configure();
    });
    document.getElementById('btn_load').addEventListener('click', ()=> {
        load_configure();
    });
    document.getElementById('btn_post').addEventListener('click', ()=> {
        post();
    });

});


const save_configure = () => {
    const bsky_id = document.getElementById("bsky_id").value;
    const bsky_pass = document.getElementById("bsky_pass").value;

    const configuration = {
        bsky_id: bsky_id,
        bsky_pass: bsky_pass
    }
    localStorage.setItem('bsky_configuration', JSON.stringify(configuration));
}

const load_configure = () => {
    const configure = JSON.parse(localStorage.getItem('bsky_configuration'));

    document.getElementById("bsky_id").value = configure.bsky_id;
    document.getElementById("bsky_pass").value = configure.bsky_pass;

    return configure;
}

const post = async () => {
    // console.log("start")
    const configure = load_configure();
    const message = document.getElementById("post_string").value;
    const local_images = document.getElementById("file").files;
    const image_urls = document.getElementById("image_urls").value;

    const bsky = new JpzBskyClient(configure.bsky_id, configure.bsky_pass);
    if (local_images.length > 0) {
        bsky.setImageFiles(local_images);
    }
    else if (image_urls.length > 0) {
        bsky.setImageUrl(image_urls);
        bsky.enableCorsProxyAtGetImage(true);
    }
    try {
        await bsky.post(message);
    }
    catch(e) {
        console.log(e);
    }
    const code = bsky.getLastErrCode();
    console.log(code);
}
