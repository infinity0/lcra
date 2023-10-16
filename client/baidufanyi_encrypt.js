// adapted from https://github.com/kgspider/crawler/blob/main/fanyi_baidu_com/baidufanyi_encrypt.js
// details in https://baijiahao.baidu.com/s?id=1741494026290456517

// This is basically a copy of the Google Translate Token algorithm, which is now public knowledge
// e.g. https://www.npmjs.com/package/google-translate-token has the same logic
window.baiduSign = (function() {

function n(r, o) {
    for (var t = 0; t < o.length - 2; t += 3) {
        var a = o.charAt(t + 2);
        a = a >= "a" ? a.charCodeAt(0) - 87 : Number(a);
        a = "+" === o.charAt(t + 1) ? r >>> a : r << a;
        r = "+" === o.charAt(t) ? r + a & 4294967295 : r ^ a;
    }
    return r
}

function e(r, gtk) {
    //console.log("gtk: ", gtk);
    var d = gtk.split(".");
    var m = Number(d[0]) || 0;
    var s = Number(d[1]) || 0;
    var S = [], c = 0;
    for (var v = 0; v < r.length; v++) {
        var A = r.charCodeAt(v);
        if (128 > A) {
            S[c++] = A
        } else {
            if (2048 > A) {
                S[c++] = A >> 6 | 192
            } else {
                if (55296 === (64512 & A) && v + 1 < r.length && 56320 === (64512 & r.charCodeAt(v + 1))) {
                    A = 65536 + ((1023 & A) << 10) + (1023 & r.charCodeAt(++v));
                    S[c++] = A >> 18 | 240;
                    S[c++] = A >> 12 & 63 | 128;
                } else {
                    S[c++] = A >> 12 | 224
                }
                S[c++] = A >> 6 & 63 | 128
            }
            S[c++] = 63 & A | 128
        }
    }
    var p = m;
    for (var b = 0; b < S.length; b++) {
        p += S[b];
        p = n(p, '+-a^+6');
    }
    p = n(p, '+-3^+b+-f');
    p ^= s;
    0 > p && (p = (2147483647 & p) + 2147483648);
    p %= 1e6;
    return p.toString() + "." + (p ^ m)
}

return e;
})();

window.baiduAscToken = (function() {

function baidu_aes_encrypt(data, key, iv) {
    data = "object" == typeof data ? JSON.stringify(data) : void 0x0 === data ? '': '' + data;
    let enc = CryptoJS.AES.encrypt(data, CryptoJS.enc.Utf8.parse(key), {
        'iv': CryptoJS.enc.Utf8.parse(iv),
        'mode': CryptoJS.mode.CBC,
        'padding': CryptoJS.pad.Pkcs7,
    });
    return enc.ciphertext.toString(CryptoJS.enc.Base64);
}

function e(initTs, translate_url){
    // 部分参数直接写死了，不同网站参数值不同，如果在项目中使用，请灵活处理
    var key = 'uyaqcsmsseqyosiy';
    var iv = '1234567887654321';
    var ae = (new Date).getTime();
    var data = {
        "ua": navigator.userAgent,
        "url": translate_url,
        "platform": "Win32",
        "clientTs": ae,
        "version": "2.2.0",
    };
    // 这里开头的时间戳写死了，如果请求失败请更新这个值
    return initTs + '_' + ae + '_' + baidu_aes_encrypt(data, key, iv);
}

return e;
})();