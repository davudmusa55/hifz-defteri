/* storage.js — Hıfz Defteri veri katmanı
 *
 * Uygulamanın geri kalanı kullanıcı verisine YALNIZCA buradaki `Depo` nesnesiyle erişir.
 * localStorage, IndexedDB ve Cache Storage'a bu dosyanın dışında dokunulmaz.
 *
 * Nerede ne duruyor (hepsi bu cihazda, hiçbir sunucuya gönderilmez):
 *   - Defter (ezberler, ilerleme, program, ders kayıtları, notlar, benzer ayetler): IndexedDB "hifz-defteri" / "kayit" / "defter".
 *     IndexedDB kullanılamazsa (bazı gizli pencereler) localStorage'a düşer.
 *   - Tercihler (tema, hat, meal görünümü, yazı boyutu, mushaf zemini): localStorage, "hifz-defteri-v1-<ad>".
 *     Açılışta ekran çizilmeden önce eşzamanlı okunmaları gerektiği için burada durur.
 *   - İndirilen Fatih Çollak sesleri: Cache Storage "ses-collak" (servis çalışanı da buradan çalar).
 *
 * İleride hesap sistemi: `Depo.adaptorSec(adaptor)` ile aynı arayüzü ({ad, oku, yaz, sil}) uygulayan
 * bir sunucu adaptörü takılabilir. Defter kayıtları `guncelleme` zamanı ve `cihaz` kimliği taşıdığı için
 * cihazlar arası birleştirme yapılabilir. Uygulama kodunun değişmesi gerekmez.
 */
(function () {
  "use strict";
  const DB_AD = "hifz-defteri", DB_SURUM = 1, TABLO = "kayit", DEFTER = "defter";
  const ESKI_ANAHTAR = "hifz-defteri-v1";            // eski sürümlerde defterin localStorage anahtarı
  const TERCIH_ON = "hifz-defteri-v1-";
  const SES_CACHE = "ses-collak";
  const YEDEK_FORMAT = "hifz-defteri-yedek", YEDEK_SURUM = 1;   // dışa aktarma dosyasının biçim sürümü
  const TERCIH_ADLARI = ["tema", "hat2", "gorunum", "zemin", "boyut", "dinle"]; // yedeğe giren tercihler

  /* ---------- Tercihler (küçük, eşzamanlı) ---------- */
  const tercih = {
    oku(ad, varsayilan) {
      try {
        const t = localStorage.getItem(TERCIH_ON + ad);
        if (t == null) return varsayilan;
        try { return JSON.parse(t); } catch (e) { return t; }   // eski sürümler düz metin yazıyordu
      } catch (e) { return varsayilan; }
    },
    yaz(ad, deger) {
      try {
        if (deger == null || deger === "") localStorage.removeItem(TERCIH_ON + ad);
        else localStorage.setItem(TERCIH_ON + ad, JSON.stringify(deger));
      } catch (e) { /* depo dolu ya da kapalı: tercih kaybolur, defter etkilenmez */ }
    },
    hepsi() { const o = {}; TERCIH_ADLARI.forEach(ad => { const v = tercih.oku(ad); if (v != null) o[ad] = v; }); return o; },
    yukle(o) { TERCIH_ADLARI.forEach(ad => { if (o && ad in o) tercih.yaz(ad, o[ad]); }); }
  };

  /* ---------- Yerel adaptör: IndexedDB, olmazsa localStorage ---------- */
  let dbSoz = null, idbYok = false;   // IndexedDB bir kez başarısız olursa bu oturumda localStorage'da kalınır (iki depo karışmasın)
  function dbAc() {
    if (idbYok) return Promise.reject(new Error("IndexedDB kullanılamıyor"));
    if (dbSoz) return dbSoz;
    dbSoz = new Promise((ok, no) => {
      if (!("indexedDB" in window)) { no(new Error("IndexedDB yok")); return; }
      setTimeout(() => no(new Error("IndexedDB cevap vermedi")), 3000);   // bazı gizli pencerelerde açılış hiç bitmez
      let r;
      try { r = indexedDB.open(DB_AD, DB_SURUM); } catch (e) { no(e); return; }
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(TABLO)) r.result.createObjectStore(TABLO); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error || new Error("IndexedDB açılamadı"));
      r.onblocked = () => no(new Error("IndexedDB meşgul"));
    });
    dbSoz.catch(() => { dbSoz = null; idbYok = true; });
    return dbSoz;
  }
  function islem(tur, anahtar, deger) {
    return dbAc().then(db => new Promise((ok, no) => {
      const tx = db.transaction(TABLO, tur === "oku" ? "readonly" : "readwrite"), st = tx.objectStore(TABLO);
      const r = tur === "oku" ? st.get(anahtar) : tur === "yaz" ? st.put(deger, anahtar) : st.delete(anahtar);
      tx.oncomplete = () => ok(r.result);
      tx.onerror = tx.onabort = () => no(tx.error || new Error("IndexedDB işlemi başarısız"));
    }));
  }
  const yerel = {
    ad: "yerel",
    surucu: "IndexedDB",
    async oku(anahtar) {
      try { return await islem("oku", anahtar); }
      catch (e) { yerel.surucu = "localStorage"; const t = localStorage.getItem(ESKI_ANAHTAR + ":" + anahtar); return t ? JSON.parse(t) : undefined; }
    },
    async yaz(anahtar, deger) {
      try { await islem("yaz", anahtar, deger); }
      catch (e) { yerel.surucu = "localStorage"; localStorage.setItem(ESKI_ANAHTAR + ":" + anahtar, JSON.stringify(deger)); }
    },
    async sil(anahtar) {
      try { await islem("sil", anahtar); } catch (e) { /* düşülecek */ }
      try { localStorage.removeItem(ESKI_ANAHTAR + ":" + anahtar); } catch (e) { }
    }
  };
  let adaptor = yerel;

  /* ---------- Cihaz kimliği (ileride cihazlar arası birleştirme için) ---------- */
  function cihazId() {
    let id = tercih.oku("cihaz");
    if (!id) { id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); tercih.yaz("cihaz", id); }
    return id;
  }

  /* ---------- Defter ---------- */
  // Kayıt zarfı: {veri, guncelleme, cihaz}. Uygulama yalnızca `veri`yi görür.
  let bekleyen = null, zamanlayici = null, yaziyor = Promise.resolve();
  async function defterOku() {
    const z = await adaptor.oku(DEFTER);
    return z && z.veri ? z.veri : null;
  }
  function defterYazHemen(veri) {
    const zarf = { veri: JSON.parse(JSON.stringify(veri)), guncelleme: Date.now(), cihaz: cihazId() };
    yaziyor = yaziyor.then(() => adaptor.yaz(DEFTER, zarf)).catch(e => { console.warn("Defter kaydedilemedi", e); });
    return yaziyor;
  }
  // Sık çağrılır (her dokunuşta); kısa bekletip tek seferde yazar. Sayfa kapanırken bekleyen hemen yazılır.
  function defterYaz(veri) {
    bekleyen = veri; clearTimeout(zamanlayici);
    zamanlayici = setTimeout(() => { const v = bekleyen; bekleyen = null; defterYazHemen(v); }, 250);
  }
  function bosalt() { if (bekleyen) { clearTimeout(zamanlayici); const v = bekleyen; bekleyen = null; return defterYazHemen(v); } return yaziyor; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") bosalt(); });
  window.addEventListener("pagehide", bosalt);

  /* Açılış: eski localStorage defterini IndexedDB'ye taşır (bir kez), sonra defteri döndürür */
  async function hazirla() {
    let veri = await defterOku(), tasindi = false;
    try {
      const eski = localStorage.getItem(ESKI_ANAHTAR);
      if (eski) {
        const e = JSON.parse(eski);
        if (!veri || (e.updated || 0) > (veri.updated || 0)) { veri = e; await defterYazHemen(e); tasindi = true; }
        if ((await defterOku())) localStorage.removeItem(ESKI_ANAHTAR);   // yalnızca yeni yere yazıldıysa sil
      }
    } catch (e) { /* bozuk eski kayıt: dokunma */ }
    return { veri, tasindi };
  }

  /* Claude yayın ortamında eski sürümler defteri hesap veritabanına da yazıyordu.
     Bu cihazda bir kez okunur; daha yeniyse yerel depoya taşınır. Artık hesaba yazılmaz. */
  async function eskiHesaptanTasi(yerelVeri) {
    if (tercih.oku("hesap-tasindi")) return null;
    const c = window.claude; if (!c || !c.use) return null;
    try {
      const [db, user] = await Promise.all([c.use("db"), c.use("user")]);
      if (!db || !user) return null;
      const id = await user.id(); if (!id) return null;
      const snap = await db.doc("data/users/" + id + "/defter").get();
      tercih.yaz("hesap-tasindi", true);
      if (!snap.exists) return null;
      const d = snap.data(); if (!d || !d.json) return null;
      const uzak = JSON.parse(d.json);
      if (yerelVeri && (yerelVeri.updated || 0) >= (uzak.updated || 0)) return null;
      await defterYazHemen(uzak);
      return uzak;
    } catch (e) { return null; }
  }

  /* ---------- Dışa / içe aktarma ---------- */
  function yedekOlustur(veri) {
    return {
      format: YEDEK_FORMAT, surum: YEDEK_SURUM, uygulama: "Hıfz Defteri",
      olusturma: new Date().toISOString(), cihaz: cihazId(),
      veri: { defter: JSON.parse(JSON.stringify(veri)), tercihler: tercih.hepsi() }
    };
  }
  // Metni ya da nesneyi çözer; geçerli değilse anlaşılır bir hata fırlatır. Eski düz yedekleri de kabul eder.
  function yedekCoz(girdi) {
    let o;
    try { o = typeof girdi === "string" ? JSON.parse(girdi.trim()) : girdi; }
    catch (e) { throw new Error("Dosya okunamadı: geçerli bir JSON değil."); }
    if (!o || typeof o !== "object") throw new Error("Dosyada veri yok.");
    if (o.format === YEDEK_FORMAT) {
      if (typeof o.surum !== "number") throw new Error("Yedek dosyasının sürümü eksik.");
      if (o.surum > YEDEK_SURUM) throw new Error(`Bu yedek uygulamanın daha yeni bir sürümüyle alınmış (biçim ${o.surum}). Önce uygulamayı güncelle.`);
      if (!o.veri || !o.veri.defter) throw new Error("Yedekte defter verisi yok.");
      return { defter: o.veri.defter, tercihler: o.veri.tercihler || {}, surum: o.surum, olusturma: o.olusturma || null };
    }
    if (o.v && o.pages) return { defter: o, tercihler: {}, surum: 0, olusturma: o.updated ? new Date(o.updated).toISOString() : null };  // eski düz yedek
    throw new Error("Bu dosya bir Hıfz Defteri yedeği değil.");
  }
  async function iceAktar(defter, tercihler) {
    defter.updated = Date.now();
    await defterYazHemen(defter);
    tercih.yukle(tercihler);
  }

  /* ---------- İndirilen sesler (Cache Storage) ---------- */
  const ses = {
    boyutlar() { return tercih.oku("ses", {}) || {}; },
    var(s) { return !!ses.boyutlar()[s]; },
    destek() { return "caches" in window; },
    async kaydet(s, anahtar, blob) {
      const c = await caches.open(SES_CACHE);
      await c.put(anahtar, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } }));
      const o = ses.boyutlar(); o[s] = blob.size; tercih.yaz("ses", o);
    },
    async temizle() { try { await caches.delete(SES_CACHE); } catch (e) { } tercih.yaz("ses", null); }
  };

  /* ---------- Kalıcılık ve bilgi ---------- */
  async function kaliciIste() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; } }
  async function bilgi() {
    let kalici = false, kullanim = null;
    try { if (navigator.storage && navigator.storage.persisted) kalici = await navigator.storage.persisted(); } catch (e) { }
    try { if (navigator.storage && navigator.storage.estimate) kullanim = (await navigator.storage.estimate()).usage; } catch (e) { }
    return { surucu: adaptor === yerel ? yerel.surucu : adaptor.ad, kalici, kullanim };
  }

  window.Depo = Object.freeze({
    YEDEK_SURUM,
    hazirla, eskiHesaptanTasi,
    defterOku, defterYaz, defterYazHemen, bosalt,
    async defterSil() { await adaptor.sil(DEFTER); },
    tercih, ses,
    yedekOlustur, yedekCoz, iceAktar,
    kaliciIste, bilgi, cihazId,
    adaptorSec(a) { if (!a || typeof a.oku !== "function" || typeof a.yaz !== "function" || typeof a.sil !== "function") throw new Error("Geçersiz adaptör"); adaptor = a; }
  });
})();
