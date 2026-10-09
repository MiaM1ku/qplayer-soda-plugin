"use strict";

// 汽水音乐源插件。接口映射参考 go-music-dl / music-lib 的 soda 实现。
// 播放只返回明文流：带 play_auth 的加密音频无法由宿主直接解码。

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
var UA_ANDROID = "com.luna.music/100198030 (Linux; U; Android 15; zh_CN_#Hans; ABR-AL80; Build/V417IR;tt-ok/3.12.13.19)";
var UA_PC = "LunaPC/3.3.0(359450208)";
var UA_PASSPORT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SodaMusic/3.1.0 Chrome/136.0.7103.59 Safari/537.36";
var SEARCH_BASE = "https://api.qishui.com/luna";
var SEO_TRACK = "https://beta-luna.douyin.com/luna/h5/seo_track";
var IMG_BASE = "https://p3-luna.douyinpic.com/img/";
var AID = "386088";

function call(method, args) { return qplayer.call(method, args || {}); }

function str(value) {
  if (value == null) return "";
  if (typeof value === "number") return String(Math.floor(value));
  return String(value).trim();
}

function num(value) {
  if (typeof value === "number") return Math.floor(value);
  var n = parseInt(String(value || "").trim(), 10);
  return isNaN(n) ? 0 : n;
}

function first() {
  for (var i = 0; i < arguments.length; i++) {
    var value = str(arguments[i]);
    if (value) return value;
  }
  return "";
}

function secureUrl(value) {
  value = str(value);
  if (!value) return "";
  if (value.indexOf("//") === 0) return "https:" + value;
  if (value.indexOf("http://") === 0) return "https://" + value.slice(7);
  return value;
}

function cookieHeader(cookies) {
  var parts = [];
  Object.keys(cookies || {}).forEach(function (name) {
    if (cookies[name]) parts.push(name + "=" + cookies[name]);
  });
  return parts.join("; ");
}

function loadCookies() {
  return call("credentials.get", { key: "cookies" }).then(function (stored) {
    if (!stored) return {};
    try { return JSON.parse(stored); } catch (_) { return {}; }
  }, function () { return {}; });
}

function mergeCookies(base, setCookies) {
  var out = {};
  Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
  (setCookies || []).forEach(function (header) {
    var pair = String(header || "").split(";")[0];
    var at = pair.indexOf("=");
    if (at <= 0) return;
    out[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  });
  return out;
}

function hasSession(cookies) {
  return !!(cookies.sessionid || cookies.sessionid_ss || cookies.sid_tt || cookies.sid_guard);
}

function request(url, opts) {
  opts = opts || {};
  return loadCookies().then(function (cookies) {
    var all = { "User-Agent": opts.ua || UA };
    if (opts.headers) Object.keys(opts.headers).forEach(function (k) { all[k] = opts.headers[k]; });
    var cookie = opts.cookie || cookieHeader(cookies);
    if (cookie) all.Cookie = cookie;
    var req = {
      url: url,
      method: opts.method || "GET",
      headers: all,
      timeoutMs: opts.timeoutMs || 15000
    };
    if (opts.body) req.body = String(opts.body);
    return call("http.request", req);
  }).then(function (response) {
    if (response.status < 200 || response.status >= 300) throw new Error("HTTP " + response.status);
    return response;
  });
}

function getJson(url, opts) {
  return request(url, opts).then(function (res) { return JSON.parse(res.body || "{}"); });
}

function androidSearchParams(extra) {
  var params = {
    device_platform: "android", os: "android", ssmix: "a",
    cdid: "46556f98-1720-4248-83da-62b74b60b46a", channel: "xiaomi_8478_64",
    aid: "8478", app_name: "luna", version_code: "100198030", version_name: "19.8.0",
    manifest_version_code: "100198030", update_version_code: "100198030",
    resolution: "1080*1920", dpi: "480", device_type: "ABR-AL80", device_brand: "HUAWEI",
    language: "zh", os_api: "35", os_version: "15", ac: "wifi", device_model: "ABR-AL80",
    package: "com.luna.music", iid: "2204957404569386", device_id: "2204957404565290",
    _rticket: String(Date.now())
  };
  Object.keys(extra || {}).forEach(function (k) { params[k] = extra[k]; });
  return Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
  }).join("&");
}

function pcParams(extra) {
  var now = Date.now();
  var params = {
    aid: AID, app_name: "luna_pc", region: "cn", geo_region: "cn", os_region: "cn",
    device_id: String(now), iid: String(now + 1), version_name: "3.3.0", version_code: "30030000",
    channel: "official", ac: "wifi", tz_name: "Asia/Shanghai", device_platform: "windows",
    device_type: "Windows", os_version: "Windows 11", fp: String(now)
  };
  Object.keys(extra || {}).forEach(function (k) { params[k] = extra[k]; });
  return Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
  }).join("&");
}

function imageUrl(img, suffix) {
  img = img || {};
  var urls = img.urls || [];
  if (!urls.length) return "";
  var cover = str(urls[0]);
  var uri = str(img.uri);
  var prefix = str(img.template_prefix);
  if (uri && prefix) return IMG_BASE + uri + "~" + prefix + "-resize:960:960.png";
  if (uri && cover.indexOf(uri) < 0) cover += uri;
  if (suffix && cover.indexOf("~") < 0) cover += suffix;
  return secureUrl(cover);
}

function joinArtists(artists) {
  var names = [];
  (artists || []).forEach(function (a) { if (a && a.name) names.push(a.name); });
  return names;
}

function durationMsOf(track) {
  var n = num(track && track.duration);
  if (n <= 0) return 0;
  return n > 10000 ? n : n * 1000;
}

function songFromTrack(track) {
  track = track || {};
  var id = str(track.id);
  var title = str(track.name);
  if (!id || !title) return null;
  var names = joinArtists(track.artists);
  var album = track.album || {};
  var cover = imageUrl(album.url_cover, "~c5_375x375.jpg");
  return {
    id: id,
    title: title,
    durationMs: durationMsOf(track),
    artworkUrl: cover,
    artworkThumbUrl: imageUrl(album.url_cover, "~c5_150x150.jpg") || cover,
    artists: names.map(function (name) { return { id: name, name: name }; }),
    album: album.name ? { id: str(album.id) || album.name, name: album.name } : undefined,
    playable: true,
    trial: !!(track.label_info && (track.label_info.is_vip || track.label_info.vip)),
    restricted: false
  };
}

function playlistFromItem(item) {
  item = item || {};
  var id = str(item.id);
  var name = str(item.title || item.name);
  if (!id || !name) return null;
  var cover = imageUrl(item.url_cover, "~c5_300x300.jpg");
  var owner = (item.owner || {});
  return {
    id: id,
    name: name,
    description: str(item.desc),
    artworkUrl: cover,
    artworkThumbUrl: cover,
    trackCount: num(item.count_tracks),
    owner: { id: str(owner.id), name: first(owner.public_name, owner.nickname) },
    songs: []
  };
}

function pageArgs(args) {
  var limit = Math.max(1, Math.min(Number(args && args.limit || 20), 100));
  var cursor = String(args && args.cursor || "").trim();
  var page = cursor ? Math.max(1, num(cursor)) : 1;
  return { query: String(args && args.query || "").trim(), limit: limit, page: page };
}

function search(kind, keyword, page, limit) {
  var cursor = (page - 1) * limit;
  var url = SEARCH_BASE + "/search/" + kind + "?" + androidSearchParams({
    q: keyword, cursor: String(cursor), count: String(limit), aid: AID
  });
  return getJson(url, { ua: UA_ANDROID });
}

function searchSongs(args) {
  var p = pageArgs(args);
  if (!p.query) return { items: [], nextCursor: "" };
  return search("track", p.query, p.page, p.limit).then(function (body) {
    var items = [];
    var seen = {};
    (body.result_groups || []).forEach(function (group) {
      (group.data || []).forEach(function (entry) {
        var song = songFromTrack(((entry.entity || {}).track) || {});
        if (!song || seen[song.id]) return;
        seen[song.id] = true;
        items.push(song);
      });
    });
    return { items: items, nextCursor: items.length >= p.limit ? String(p.page + 1) : "" };
  });
}

function searchAlbums(args) {
  var p = pageArgs(args);
  if (!p.query) return { items: [], nextCursor: "" };
  return search("album", p.query, p.page, p.limit).then(function (body) {
    var items = [];
    (body.result_groups || []).forEach(function (group) {
      (group.data || []).forEach(function (entry) {
        var album = ((entry.entity || {}).album) || {};
        var id = str(album.id);
        var name = str(album.name);
        if (!id || !name) return;
        var cover = imageUrl(album.url_cover, "~c5_300x300.jpg");
        items.push({
          id: id, name: name, description: str(album.company),
          artworkUrl: cover, artworkThumbUrl: cover,
          trackCount: num(album.count_tracks),
          artists: joinArtists(album.artists).map(function (n) { return { id: n, name: n }; })
        });
      });
    });
    return { items: items, nextCursor: items.length >= p.limit ? String(p.page + 1) : "" };
  });
}

function seoTrack(id) {
  return getJson(SEO_TRACK + "?track_id=" + encodeURIComponent(id) + "&device_platform=web");
}

function webTrack(id) {
  var url = "https://api.qishui.com/luna/pc/track_v2?track_id=" + encodeURIComponent(id)
    + "&media_type=track&aid=" + AID + "&device_platform=web&channel=pc_web";
  return getJson(url).then(function (body) {
    if (body && (body.track || body.track_info)) return body;
    return seoTrack(id);
  }, function () { return seoTrack(id); });
}

function primaryTrack(body) {
  return (body && (body.track || body.track_info || (body.seo_track && body.seo_track.track))) || {};
}

function songDetails(args) {
  var ids = (args && args.ids || []).map(str).filter(Boolean).slice(0, 20);
  if (!ids.length) return Promise.resolve([]);
  var out = [];
  return ids.reduce(function (chain, id) {
    return chain.then(function () {
      return webTrack(id).then(function (body) {
        var song = songFromTrack(primaryTrack(body));
        if (song) out.push(song);
      }, function () {});
    });
  }, Promise.resolve()).then(function () { return out; });
}

function pcHeaders() {
  return {
    "User-Agent": UA_PC,
    "x-luna-background-type": "foreground",
    "x-luna-is-background-req": "0",
    "x-luna-is-local-user": "1"
  };
}

function playlistDetails(args) {
  var id = str(args && args.id);
  if (!id) throw new Error("缺少歌单 ID");
  var songs = [];
  var seen = {};
  var meta = null;
  function page(cursor, n) {
    if (n > 20) return finish();
    var url = "https://api.qishui.com/luna/pc/playlist/detail?" + pcParams({
      playlist_id: id, cursor: cursor || "", count: "100"
    });
    return getJson(url, { ua: UA_PC, headers: pcHeaders() }).then(function (body) {
      if (!meta) meta = playlistFromItem(body.playlist || { id: id, title: id });
      (body.media_resources || []).forEach(function (item) {
        if (item.type && item.type !== "track") return;
        var track = (((item.entity || {}).track_wrapper || {}).track) || ((item.entity || {}).track) || {};
        var song = songFromTrack(track);
        if (!song || seen[song.id]) return;
        seen[song.id] = true;
        if (!song.artworkUrl && meta) song.artworkUrl = meta.artworkUrl;
        songs.push(song);
      });
      var next = str(body.next_cursor);
      if (!next || next === cursor || (!body.has_more && (body.media_resources || []).length < 100)) return finish();
      return page(next, n + 1);
    }, function () {
      if (meta) return finish();
      var url = "https://api.qishui.com/luna/pc/playlist/detail?playlist_id=" + encodeURIComponent(id)
        + "&cursor=0&cnt=20&aid=" + AID + "&device_platform=web&channel=pc_web";
      return getJson(url).then(function (body) {
        meta = playlistFromItem(body.playlist || { id: id, title: id });
        (body.media_resources || []).forEach(function (item) {
          var track = (((item.entity || {}).track_wrapper || {}).track) || {};
          var song = songFromTrack(track);
          if (song && !seen[song.id]) { seen[song.id] = true; songs.push(song); }
        });
        return finish();
      });
    });
  }
  function finish() {
    if (!meta) throw new Error("歌单不存在");
    meta.songs = songs;
    if (!meta.trackCount) meta.trackCount = songs.length;
    return meta;
  }
  return page("", 0);
}

function extractJsonBlock(page, marker) {
  var start = page.indexOf(marker);
  if (start < 0) return "";
  start += marker.length;
  var depth = 0, inString = false, escaped = false, begun = false;
  for (var i = start; i < page.length; i++) {
    var ch = page.charAt(i);
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === "{") { depth++; begun = true; }
    else if (ch === "}") {
      depth--;
      if (begun && depth === 0) return page.slice(start, i + 1);
    }
  }
  return "";
}

function albumDetails(args) {
  var id = str(args && args.id);
  if (!id) throw new Error("缺少专辑 ID");
  var url = "https://www.qishui.com/share/album?album_id=" + encodeURIComponent(id);
  return request(url).then(function (res) {
    var json = extractJsonBlock(String(res.body || ""), "_ROUTER_DATA = ");
    if (!json) throw new Error("专辑页解析失败");
    var page = JSON.parse(json);
    var info = (((page.loaderData || {}).albumPage) || {}).albumInfo || {};
    var list = (((page.loaderData || {}).albumPage) || {}).trackList || [];
    var cover = imageUrl(info.url_cover, "~c5_300x300.jpg");
    var songs = [];
    list.forEach(function (track) {
      var song = songFromTrack(track);
      if (!song) return;
      if (!song.artworkUrl) song.artworkUrl = cover;
      if (!song.album) song.album = { id: first(info.id, id), name: first(info.name, id) };
      songs.push(song);
    });
    return {
      id: first(info.id, id),
      name: first(info.name, id),
      description: str((info.pc_lines || []).join(" ") || info.company),
      artworkUrl: cover,
      artworkThumbUrl: cover,
      trackCount: num(info.count_tracks) || songs.length,
      artists: joinArtists(info.artists).map(function (n) { return { id: n, name: n }; }),
      songs: songs
    };
  });
}

function artistDetails(args) {
  var id = str(args && args.id);
  if (!id) throw new Error("缺少歌手 ID");
  return searchSongs({ query: id, limit: 50, cursor: "" }).then(function (page) {
    var songs = (page.items || []).filter(function (song) {
      return (song.artists || []).some(function (artist) {
        return artist.id === id || artist.name === id;
      });
    });
    if (!songs.length) songs = page.items || [];
    return { id: id, name: id, songs: songs.slice(0, 50), songCount: songs.length };
  });
}

function home(args) {
  var limit = Math.max(1, Math.min(Number(args && args.limit || 20), 100));
  if (args && args.operation === "recommendSongs") return [];
  return search("playlist", "流行", 1, limit).then(function (body) {
    var playlists = [];
    (body.result_groups || []).forEach(function (group) {
      (group.data || []).forEach(function (entry) {
        var pl = playlistFromItem(((entry.entity || {}).playlist) || {});
        if (pl) playlists.push(pl);
      });
    });
    return { songs: [], playlists: playlists.slice(0, limit), sections: [] };
  }, function () {
    return { songs: [], playlists: [], sections: [] };
  });
}

function userPlaylists(args) {
  var limit = Math.max(1, Math.min(Number(args && args.limit || 50), 100));
  return loadCookies().then(function (cookies) {
    if (!hasSession(cookies)) return [];
    return getJson("https://api.qishui.com/luna/pc/me?" + pcParams(), { ua: UA_PC, headers: pcHeaders() })
      .then(function (me) {
        var userId = str((me.my_info || {}).id);
        if (!userId) return [];
        return getJson("https://api.qishui.com/luna/pc/user/playlist?" + pcParams({
          user_id: userId, cursor: "", count: String(Math.max(limit, 50))
        }), { ua: UA_PC, headers: pcHeaders() }).then(function (body) {
          var out = [];
          (body.playlists || []).forEach(function (item) {
            var pl = playlistFromItem(item);
            if (pl) { pl.owned = true; out.push(pl); }
          });
          return out.slice(0, limit);
        });
      }, function () { return []; });
  });
}

function pickPlainStream(list) {
  var best = null;
  (list || []).forEach(function (info) {
    var url = first(info.MainPlayURL || info.main_play_url, info.BackupPlayURL || info.backup_play_url);
    var auth = str(info.PlayAuth || info.play_auth);
    if (!url || auth) return;
    if (!best || num(info.Size || info.size) > num(best.Size || best.size)) best = {
      url: url, format: info.Format || info.format, size: info.Size || info.size
    };
  });
  return best;
}

function playerInfo(url) {
  return getJson(url).then(function (body) {
    return pickPlainStream(((((body.Result || {}).Data) || {}).PlayInfoList) || []);
  });
}

function collectVideoUrls(value, out) {
  if (!value) return;
  if (Object.prototype.toString.call(value) === "[object Array]") {
    value.forEach(function (item) { collectVideoUrls(item, out); });
    return;
  }
  if (typeof value !== "object") return;
  var url = first(value.MainPlayURL, value.main_play_url, value.main_url, value.PlayUrl, value.play_url);
  var auth = str(value.PlayAuth || value.play_auth);
  if (url && !auth) out.push({ url: url, format: value.Format || value.format, size: value.Size || value.size });
  Object.keys(value).forEach(function (key) { collectVideoUrls(value[key], out); });
}

function resolveStream(args) {
  var id = str(args && args.id);
  if (!id) throw new Error("缺少歌曲 ID");
  return webTrack(id).then(function (body) {
    var player = body.track_player || body.TrackPlayer || {};
    var videoRaw = player.video_model || player.VideoModel;
    var fromVideo = [];
    if (videoRaw) {
      var parsed = videoRaw;
      if (typeof videoRaw === "string") {
        try { parsed = JSON.parse(videoRaw); } catch (_) { parsed = {}; }
      }
      collectVideoUrls(parsed, fromVideo);
    }
    var video = fromVideo[0];
    if (video && video.url) {
      return {
        url: secureUrl(video.url),
        headers: { "User-Agent": UA },
        mimeType: "audio/mp4",
        expiresAtMs: Date.now() + 10 * 60 * 1000,
        trial: false,
        cacheable: false
      };
    }
    var infoUrl = player.url_player_info || player.URLPlayerInfo || "";
    if (!infoUrl) throw new Error("未找到播放信息");
    return playerInfo(infoUrl).then(function (info) {
      if (!info || !info.url) {
        throw new Error("该歌曲仅提供加密流，当前插件无法在播放器内解密");
      }
      var mime = String(info.format || "").toLowerCase().indexOf("mp3") >= 0 ? "audio/mpeg" : "audio/mp4";
      return {
        url: secureUrl(info.url),
        headers: { "User-Agent": UA },
        mimeType: mime,
        expiresAtMs: Date.now() + 10 * 60 * 1000,
        trial: false,
        cacheable: false
      };
    });
  });
}

function sodaLyricToLrc(raw) {
  var lines = [];
  String(raw || "").split(/\r?\n/).forEach(function (line) {
    var match = /^\[(\d+),(\d+)\](.*)$/.exec(line.trim());
    if (!match) return;
    var start = num(match[1]);
    var content = String(match[3] || "").replace(/<[^>]+>/g, "");
    var m = Math.floor(start / 60000);
    var s = Math.floor((start % 60000) / 1000);
    var cs = Math.floor((start % 1000) / 10);
    var mm = m < 10 ? "0" + m : String(m);
    var ss = s < 10 ? "0" + s : String(s);
    var cc = cs < 10 ? "0" + cs : String(cs);
    lines.push("[" + mm + ":" + ss + "." + cc + "]" + content);
  });
  return lines.join("\n");
}

function lyrics(args) {
  var id = str(args && args.id);
  if (!id) return { assets: [] };
  return webTrack(id).then(function (body) {
    var content = str(((body.lyric || {}).content) || ((body.seo_track || {}).lyric || {}).content);
    var textLrc = sodaLyricToLrc(content);
    return textLrc ? { assets: [{ format: "lrc", role: "original", text: textLrc }] } : { assets: [] };
  }, function () { return { assets: [] }; });
}

function account() {
  return loadCookies().then(function (cookies) {
    if (!hasSession(cookies)) return { loggedIn: false };
    return getJson("https://api.qishui.com/luna/pc/me?" + pcParams(), { ua: UA_PC, headers: pcHeaders() })
      .then(function (body) {
        var me = body.my_info || {};
        var id = str(me.id);
        if (!id) return { loggedIn: false };
        return {
          loggedIn: true, id: id,
          displayName: first(me.nickname, me.public_name, "汽水用户 " + id),
          avatarUrl: imageUrl(me.larger_avatar_url, "~c5_200x200.jpg"),
          membershipTier: 0, level: 0, signature: ""
        };
      }, function () { return { loggedIn: true, id: "soda", displayName: "汽水用户", avatarUrl: "", membershipTier: 0, level: 0, signature: "" }; });
  });
}

function parseCookieString(raw) {
  var parsed = {};
  String(raw || "").split(";").forEach(function (part) {
    var at = part.indexOf("=");
    if (at <= 0) return;
    parsed[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  });
  return parsed;
}

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[_-]/g, "");
}

function findJsonString(value, field) {
  var want = normalizeKey(field);
  if (value == null) return "";
  if (typeof value === "string") {
    var text = value.trim();
    if (text.charAt(0) === "{") {
      try { return findJsonString(JSON.parse(text), field); } catch (_) { return ""; }
    }
    return "";
  }
  if (Object.prototype.toString.call(value) === "[object Array]") {
    for (var i = 0; i < value.length; i++) {
      var found = findJsonString(value[i], field);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  var keys = Object.keys(value);
  for (var k = 0; k < keys.length; k++) {
    if (normalizeKey(keys[k]) === want) {
      var child = value[keys[k]];
      if (typeof child === "string" && child.trim()) return child.trim();
      if (typeof child === "number") return String(Math.floor(child));
    }
  }
  for (var j = 0; j < keys.length; j++) {
    var nested = findJsonString(value[keys[j]], field);
    if (nested) return nested;
  }
  return "";
}

var VERIFY_KEYS = {
  passport_mfa_retry_tag: true,
  std_verify_flow_id: true,
  std_verify_scene: true,
  std_verify_template: true,
  std_verify_token: true,
  std_verify_type: true,
  std_verify_way: true
};

function collectVerify(value, out) {
  if (!value) return;
  if (typeof value === "string") {
    var text = value.trim();
    if (text.indexOf("std_verify_") >= 0 || text.indexOf("passport_mfa_retry_tag") >= 0) {
      var q = text.indexOf("?") >= 0 ? text.slice(text.indexOf("?") + 1) : text;
      q.split("&").forEach(function (part) {
        var at = part.indexOf("=");
        if (at <= 0) return;
        var key = decodeURIComponent(part.slice(0, at));
        var val = decodeURIComponent(part.slice(at + 1));
        if (VERIFY_KEYS[key] && val) out[key] = val;
      });
    }
    return;
  }
  if (Object.prototype.toString.call(value) === "[object Array]") {
    value.forEach(function (item) { collectVerify(item, out); });
    return;
  }
  if (typeof value !== "object") return;
  Object.keys(value).forEach(function (key) {
    if (VERIFY_KEYS[key] && value[key] != null && String(value[key]).trim()) {
      out[key] = String(value[key]).trim();
    }
    collectVerify(value[key], out);
  });
}

function formOf(map) {
  return Object.keys(map).map(function (key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(map[key]);
  }).join("&");
}

function utf8Hex(value) {
  var encoded = unescape(encodeURIComponent(String(value)));
  var out = "";
  for (var i = 0; i < encoded.length; i++) {
    var h = (encoded.charCodeAt(i) & 255).toString(16);
    out += h.length < 2 ? "0" + h : h;
  }
  return out;
}

function passportLiteQuery() {
  var now = String(Date.now());
  return formOf({
    passport_jssdk_version: "5.1.2",
    passport_jssdk_type: "lite",
    is_from_ttaccountsdk: "1",
    aid: AID,
    language: "zh",
    account_app_language: "en-US",
    new_authn_sdk_version: "1.0.0.404-web",
    is_new_login: "1",
    is_from_iesaccountsaas: "1",
    device_id: now,
    install_id: String(Number(now) + 1),
    did: now,
    iid: String(Number(now) + 1),
    device_platform: "PC",
    version_code: "3.3.0"
  });
}

function loadMfa() {
  return call("storage.get", { key: "mfaPending" }).then(function (stored) {
    if (!stored) return null;
    try { return JSON.parse(stored); } catch (_) { return null; }
  }, function () { return null; });
}

function saveMfa(state) {
  return call("storage.put", { key: "mfaPending", value: JSON.stringify(state || {}) });
}

function passportPost(url, form, cookies) {
  return call("http.request", {
    url: url,
    method: "POST",
    headers: passportHeaders(cookies),
    body: form,
    timeoutMs: 20000
  });
}

function sendSodaSms(state) {
  var params = {
    mix_mode: "1",
    type: "3737",
    encrypt_uid: state.encryptUid || "",
    verify_ticket: "",
    copywriting_key: "qr_connect",
    ies_safety_diversion_tag: "mfa",
    new_verify_flow: "",
    std_verify_way: "mobile_sms_verify",
    is6Digits: "1",
    aid: AID,
    new_authn_sdk_version: "1.0.0.404-web"
  };
  var extra = state.verify || {};
  Object.keys(extra).forEach(function (key) { params[key] = extra[key]; });
  return passportPost(
    "https://api.qishui.com/passport/web/send_code/?" + passportLiteQuery(),
    formOf(params),
    state.cookies || {}
  ).then(function (response) {
    var body = {};
    try { body = JSON.parse(response.body || "{}"); } catch (_) {}
    state.cookies = mergeCookies(state.cookies, response.setCookies);
    var msg = String(body.message || "").toLowerCase();
    var ok = !msg || msg === "success" || msg === "ok";
    if (!ok) throw new Error(body.message || "验证码发送失败");
    state.mobile = str((body.data || {}).mobile) || state.mobile;
    state.sent = true;
    return saveMfa(state).then(function () { return state; });
  });
}

function validateSodaSms(code) {
  return loadMfa().then(function (state) {
    if (!state || !state.encryptUid) {
      return { methodId: "cookie", status: "failed", message: "没有进行中的短信验证，请先扫码" };
    }
    var params = {
      mix_mode: "1",
      type: "3737",
      encrypt_uid: state.encryptUid,
      verify_ticket: "",
      copywriting_key: "qr_connect",
      ies_safety_diversion_tag: "mfa",
      new_verify_flow: "",
      std_verify_way: "mobile_sms_verify",
      code: utf8Hex(code),
      aid: AID,
      new_authn_sdk_version: "1.0.0.404-web"
    };
    var extra = state.verify || {};
    Object.keys(extra).forEach(function (key) { params[key] = extra[key]; });
    return passportPost(
      "https://api.qishui.com/passport/web/validate_code/?" + passportLiteQuery(),
      formOf(params),
      state.cookies || {}
    ).then(function (response) {
      var body = {};
      try { body = JSON.parse(response.body || "{}"); } catch (_) {}
      var cookies = mergeCookies(state.cookies, response.setCookies);
      var msg = String(body.message || "").toLowerCase();
      var ticket = str((body.data || {}).ticket);
      if (!ticket && msg && msg !== "success" && msg !== "ok") {
        return { methodId: "cookie", status: "failed", message: "验证码错误: " + body.message };
      }
      var form = "need_logo=false&need_short_url=false&is_frontier=true&token="
        + encodeURIComponent(state.token || "") + "&is_new_login=1&next="
        + encodeURIComponent("https://api.qishui.com");
      var verify = state.verify || {};
      Object.keys(verify).forEach(function (key) {
        form += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(verify[key]);
      });
      return passportPost(
        "https://api.qishui.com/passport/web/check_qrconnect/?" + passportQuery(),
        form,
        cookies
      ).then(function (check) {
        var finalCookies = mergeCookies(cookies, check.setCookies);
        if (!hasSession(finalCookies)) {
          return { methodId: "cookie", status: "failed", message: "验证通过，但未拿到登录 Cookie" };
        }
        return call("credentials.put", { key: "cookies", value: JSON.stringify(finalCookies) })
          .then(function () { return saveMfa({}); })
          .then(function () { return account(); })
          .then(function (profile) {
            return { methodId: "cookie", status: "success", account: profile };
          });
      });
    });
  });
}

function handleSodaMfa(token, cookies, rawBody, parsed) {
  return loadMfa().then(function (existing) {
    if (existing && existing.token === token && existing.sent) {
      return {
        id: token, methodId: "qr", status: "failed",
        message: "验证码已发送" + (existing.mobile ? "至 " + existing.mobile : "")
          + "。请切换到 Cookie，只粘贴 6 位短信验证码。"
      };
    }
    var verify = {};
    collectVerify(parsed, verify);
    var state = {
      token: token,
      cookies: cookies,
      encryptUid: findJsonString(parsed, "encrypt_uid"),
      verify: verify,
      mobile: findJsonString(parsed, "mobile") || str(((parsed.data || {}).user_data || {}).mobile),
      sent: false
    };
    if (!state.encryptUid && !Object.keys(verify).length) {
      return {
        id: token, methodId: "qr", status: "failed",
        message: "需要短信验证，但未返回验证参数。请改用完整 Cookie 登录。"
      };
    }
    return saveMfa(state).then(function () { return sendSodaSms(state); }).then(function (sent) {
      return {
        id: token, methodId: "qr", status: "failed",
        message: "验证码已发送" + (sent.mobile ? "至 " + sent.mobile : "")
          + "。请切换到 Cookie，只粘贴 6 位短信验证码。"
      };
    }, function (error) {
      return {
        id: token, methodId: "qr", status: "failed",
        message: String(error && error.message || error || "验证码发送失败") + "。也可改用完整 Cookie。"
      };
    });
  });
}

function passportQuery() {
  var now = String(Date.now());
  var params = [
    ["passport_jssdk_version", "2.4.13"],
    ["passport_jssdk_type", "normal"],
    ["is_from_ttaccountsdk", "1"],
    ["aid", AID],
    ["language", "zh"],
    ["is_new_login", "1"],
    ["is_from_iesaccountsaas", "1"],
    ["device_id", now],
    ["install_id", String(Number(now) + 1)],
    ["did", now],
    ["iid", String(Number(now) + 1)],
    ["device_platform", "PC"],
    ["version_code", "3.3.0"],
    ["account_sdk_source", "web"],
    ["p_js_v", "2.4.13"],
    ["p_js_t", "pro"],
    ["p_zt", "3.3.5"],
    ["p_ver", "1.0.29"],
    ["request_host", "app://resources"],
    ["p_bd", "1.0.0.41"]
  ];
  return params.map(function (pair) {
    return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
  }).join("&");
}

function passportHeaders(cookies) {
  var headers = {
    "User-Agent": UA_PASSPORT,
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json, text/javascript",
    "Cookie": cookieHeader(cookies || {})
  };
  var csrf = str(cookies && cookies.passport_csrf_token);
  if (csrf) headers["x-tt-passport-csrf-token"] = csrf;
  return headers;
}

function sodaQrUrl(token, data) {
  return first(data && data.qrcode_index_url, data && data.web_url,
    "https://bff-pc.qishui.com/light/invoke/scan_login?token="
      + encodeURIComponent(token) + "&os=Windows");
}

function sodaAppUrl(qrUrl) {
  return "snssdk1128://webview?url=" + encodeURIComponent(qrUrl);
}

function sodaBegin(methodId) {
  return call("http.request", {
    url: "https://api.qishui.com/passport/web/get_qrcode/?" + passportQuery()
      + "&next=" + encodeURIComponent("https://api.qishui.com")
      + "&need_logo=false&need_short_url=false&is_frontier=true",
    method: "GET",
    headers: { "User-Agent": UA_PASSPORT, "Accept": "application/json, text/javascript" },
    timeoutMs: 15000
  }).then(function (response) {
    var body = JSON.parse(response.body || "{}");
    var data = body.data || {};
    var token = str(data.token);
    if (!token) throw new Error(body.message || "未能获取登录二维码");
    var cookies = mergeCookies({}, response.setCookies);
    var qrUrl = sodaQrUrl(token, data);
    return call("crypto.digest", { algorithm: "MD5", data: token, dataEncoding: "utf8", outputEncoding: "hex" }).then(function (hex) {
      return call("storage.put", { key: "qr" + hex, value: JSON.stringify(cookies) }).then(function () {
        return {
          id: token, methodId: methodId, status: "waiting",
          qrContent: qrUrl,
          appUrl: sodaAppUrl(qrUrl),
          appLabel: "打开抖音",
          expiresAtMs: Date.now() + 5 * 60 * 1000
        };
      });
    });
  });
}

function login(args) {
  switch (args && args.operation) {
    case "methods": {
      var methods = [{
        id: "qr", type: "qr", label: "扫码登录",
        instructions: "打开汽水音乐 App 扫描二维码。若提示短信验证，切换到 Cookie 只填验证码。"
      }, {
        id: "web", type: "web", label: "网页登录",
        instructions: "打开抖音网页登录。成功后会自动读取 sessionid 并验证汽水账号。可用另一台设备扫网页上的码，或用账号密码。",
        webUrl: "https://www.douyin.com/user/self",
        cookieUrl: "https://www.douyin.com",
        credentialCookieName: "sessionid"
      }, {
        id: "cookie", type: "credential", label: "Cookie / 验证码",
        instructions: "可粘贴含 sessionid 的完整 Cookie。扫码后若要短信验证，这里只填 6 位验证码。",
        credentialLabel: "Cookie 或短信验证码"
      }];
      if (args && args.platform === "android") {
        methods.unshift({
          id: "douyin", type: "app", label: "抖音一键登录",
          appLabel: "打开抖音",
          instructions: "将跳转到抖音 App 确认登录汽水账号。请先安装抖音。"
        });
      }
      return methods;
    }
    case "begin":
      if (args.methodId !== "qr" && args.methodId !== "douyin") {
        throw new Error("该登录方式不需要创建挑战");
      }
      return sodaBegin(args.methodId);
    case "poll": {
      var token = str(args.challengeId);
      if (!token) throw new Error("缺少登录挑战 ID");
      return call("crypto.digest", { algorithm: "MD5", data: token, dataEncoding: "utf8", outputEncoding: "hex" }).then(function (hex) {
      return call("storage.get", { key: "qr" + hex }).then(function (stored) {
        var pending = {};
        try { pending = stored ? JSON.parse(stored) : {}; } catch (_) {}
        var form = "need_logo=false&need_short_url=false&is_frontier=true&token="
          + encodeURIComponent(token) + "&is_new_login=1&next=" + encodeURIComponent("https://api.qishui.com");
        return call("http.request", {
          url: "https://api.qishui.com/passport/web/check_qrconnect/?" + passportQuery(),
          method: "POST",
          headers: passportHeaders(pending),
          body: form,
          timeoutMs: 20000
        }).then(function (response) {
          var cookies = mergeCookies(pending, response.setCookies);
          if (hasSession(cookies)) {
            return call("credentials.put", { key: "cookies", value: JSON.stringify(cookies) })
              .then(function () { return account(); })
              .then(function (profile) {
                return { id: token, methodId: "qr", status: "success", account: profile };
              });
          }
          var body = {};
          try { body = JSON.parse(response.body || "{}"); } catch (_) {}
          var data = body.data || {};
          if (num(data.error_code) === 7) {
            return { id: token, methodId: "qr", status: "waiting", message: "正在等待汽水接口冷却" };
          }
          if (num(data.error_code) === 2046 || String(data.account_flow || "").toLowerCase() === "verify") {
            return handleSodaMfa(token, cookies, response.body, body);
          }
          var status = String(data.status || "").toLowerCase();
          if (status === "confirmed" || status === "scanned") {
            return call("storage.put", { key: "qr" + hex, value: JSON.stringify(cookies) })
              .then(function () { return { id: token, methodId: "qr", status: "scanned" }; });
          }
          if (status === "expired") return { id: token, methodId: "qr", status: "expired" };
          return { id: token, methodId: "qr", status: "waiting" };
        }, function () { return { id: token, methodId: "qr", status: "waiting" }; });
      });
      });
    }
    case "submit": {
      var cred = String(args.credential || "").trim();
      if (/^\d{4,8}$/.test(cred)) return validateSodaSms(cred);
      var parsed = parseCookieString(args.credential);
      if (!hasSession(parsed)) {
        return { methodId: "cookie", status: "failed", message: "Cookie 中找不到 sessionid；若正在短信验证请只填验证码" };
      }
      return call("credentials.put", { key: "cookies", value: JSON.stringify(parsed) })
        .then(function () { return account(); })
        .then(function (profile) {
          return { methodId: "cookie", status: "success", account: profile };
        });
    }
    case "logout":
      return call("credentials.delete", { key: "cookies" }).then(function () { return true; }, function () { return true; });
    default:
      throw new Error("未知登录操作");
  }
}

module.exports = {
  handlers: {
    searchSongs: searchSongs,
    searchAlbums: searchAlbums,
    songDetails: songDetails,
    playlistDetails: playlistDetails,
    albumDetails: albumDetails,
    artistDetails: artistDetails,
    home: home,
    userPlaylists: userPlaylists,
    resolveStream: resolveStream,
    lyrics: lyrics,
    account: account,
    login: login
  }
};
