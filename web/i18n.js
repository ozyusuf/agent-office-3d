// All UI strings. `{name}` is a value; `[ ...{name}... ]` is dropped when a value inside is missing.
// Keys are the same in every language (checked by test/i18n.test.js).

export const LANGS = ['tr', 'en'];

const STRINGS = {
  en: {
    realmTitle: 'Cyber-Realm',
    connecting: 'Connecting…',
    waitingEvents: 'Waiting for events…',
    session: 'Session',
    toolsDone: '{n} tools',
    context: 'Context',
    effort: 'Effort',
    time: 'Time',
    hookFlow: 'Hook Flow',
    lvl: 'Lvl',
    xp: '{xp} / {next} XP',
    'tip.xp': 'Level {level} · {total} finished tool calls in total',
    'tip.context': 'Tool calls since the last compaction (bar full at {max})',
    'tip.contextLow': 'At least this many: the server joined this session late',
    'tip.effort': 'Effort level reported by Claude Code',
    'tip.effortNone': 'No effort level in the events yet',
    'tip.time': 'Since the session started (bar full at {max} min)',
    'tip.timeLow': 'At least this long: counted from the first event the server saw',
    'conn.connecting': 'Connecting to the server…',
    'conn.open': 'Server connected',
    'conn.closed': 'Server offline – retrying',
    'status.none': 'No session yet',
    'status.working': 'Working',
    'status.idle': 'Idle',
    'status.waiting': 'Waiting for permission',
    'status.error': 'Error',
    'status.ended': 'Session ended',
    settings: 'Settings',
    language: 'Language',
    debugView: 'Raw event stream (debug)',
    settingsNote: 'Saved defaults live in config.json.',
    active: 'active',

    'skill.read': 'Read',
    'skill.search': 'Grep',
    'skill.edit': 'Edit',
    'skill.shell': 'Bash',
    'skill.web': 'Web',
    'skill.permission': 'Permission',
    'skill.permissionWaiting': 'Permission needed',

    'station.desk': 'Command Desk',
    'station.smelter': 'Code Smelter',
    'station.board': 'Vision & Task Board',
    'station.centrifuge': 'Test Centrifuge',
    'station.orbit': 'Orbit Sphere',
    'station.racks': 'Server Racks',
    'station.falls': 'Data Falls',
    'station.portal': 'Portal Ring',
    'station.arcade': 'Arcade',

    'effort.low': 'low',
    'effort.medium': 'medium',
    'effort.high': 'high',
    'effort.xhigh': 'extra high',
    'effort.max': 'max',

    'act.none': 'Waiting for events',
    'act.idle': 'Idle',
    'act.thinking': 'Thinking…',
    'act.ended': 'Session ended',
    'act.error': 'Error[ ({error})]',
    'act.waiting': 'Waiting for permission[ ({tool})]',
    'act.compacting': 'Compacting context',
    'act.read': 'Reading[ ({target})]',
    'act.search': 'Searching[ ({target})]',
    'act.edit': 'Editing[ ({target})]',
    'act.shell': 'Running a command',
    'act.web': 'Searching the web[ ({target})]',
    'act.task': 'Planning tasks',
    'act.agent': 'Delegating[ ({target})]',
    'act.other': 'Using {tool}',

    'log.sessionStart': 'Session started[ ({source})]',
    'log.prompt': 'New request',
    'log.read': 'Reading[ {target}]...',
    'log.search': 'Searching[: {target}]',
    'log.edit': 'Editing[ {target}]...',
    'log.write': 'Writing[ {target}]...',
    'log.shell': 'Running[: {target}]',
    'log.webFetch': 'Fetching[ {target}]...',
    'log.webSearch': 'Searching the web[: {target}]',
    'log.task': 'Updating the task list',
    'log.agent': 'Sending out a helper[: {target}]',
    'log.other': 'Using {tool}[: {target}]',
    'log.toolFailed': '{tool} failed[: {error}]',
    'log.interrupted': '{tool} interrupted',
    'log.permission': 'Permission needed: {tool}[ ({target})]',
    'log.helperStart': 'Helper launched[ ({type})]',
    'log.helperStop': 'Helper returned[ ({type})]',
    'log.preCompact': 'Compacting context[ ({trigger})]',
    'log.postCompact': 'Context compacted',
    'log.stop': 'Turn finished',
    'log.stopFailure': 'Turn failed[: {error}]',
    'log.sessionEnd': 'Session ended[ ({reason})]',

    'source.startup': 'new',
    'source.resume': 'resumed',
    'source.clear': 'after /clear',
    'source.compact': 'after compaction',
    'source.fork': 'forked',
    'trigger.auto': 'auto',
    'trigger.manual': 'manual',
    'reason.clear': '/clear',
    'reason.resume': 'resume',
    'reason.logout': 'logout',
    'reason.prompt_input_exit': 'exit',
    'reason.other': 'other',
    'error.rate_limit': 'rate limit',
    'error.overloaded': 'overloaded',
    'error.authentication_failed': 'authentication failed',
    'error.billing_error': 'billing error',
    'error.server_error': 'server error',
    'error.max_output_tokens': 'output limit',
    'error.unknown': 'unknown',

    'unit.h': 'h',
    'unit.m': 'm',
    'unit.s': 's',
  },

  tr: {
    realmTitle: 'Siber Diyar',
    connecting: 'Bağlanıyor…',
    waitingEvents: 'Olaylar bekleniyor…',
    session: 'Oturum',
    toolsDone: '{n} araç',
    context: 'Bağlam',
    effort: 'Efor',
    time: 'Süre',
    hookFlow: 'Hook Akışı',
    lvl: 'Lvl',
    xp: '{xp} / {next} XP',
    'tip.xp': 'Seviye {level} · toplam {total} tamamlanan araç çağrısı',
    'tip.context': 'Son sıkıştırmadan beri araç çağrısı (çubuk {max} ile dolar)',
    'tip.contextLow': 'En az bu kadar: sunucu bu oturuma sonradan katıldı',
    'tip.effort': "Claude Code'un bildirdiği efor seviyesi",
    'tip.effortNone': 'Olaylarda henüz efor bilgisi yok',
    'tip.time': 'Oturum başından beri (çubuk {max} dk ile dolar)',
    'tip.timeLow': 'En az bu kadar: sunucunun gördüğü ilk olaydan beri',
    'conn.connecting': 'Sunucuya bağlanıyor…',
    'conn.open': 'Sunucu bağlı',
    'conn.closed': 'Sunucu kapalı – yeniden deneniyor',
    'status.none': 'Henüz oturum yok',
    'status.working': 'Çalışıyor',
    'status.idle': 'Boşta',
    'status.waiting': 'İzin bekliyor',
    'status.error': 'Hata',
    'status.ended': 'Oturum bitti',
    settings: 'Ayarlar',
    language: 'Dil',
    debugView: 'Ham olay akışı (debug)',
    settingsNote: 'Kalıcı varsayılanlar config.json dosyasında.',
    active: 'Aktif',

    'skill.read': 'Oku',
    'skill.search': 'Ara',
    'skill.edit': 'Düzenle',
    'skill.shell': 'Komut',
    'skill.web': 'Web',
    'skill.permission': 'İzin',
    'skill.permissionWaiting': 'İzin Bekliyor',

    'station.desk': 'Komuta Masası',
    'station.smelter': 'Kod Ergitme',
    'station.board': 'Görüş ve Görev Panosu',
    'station.centrifuge': 'Test Sınama',
    'station.orbit': 'Yörünge Küresi',
    'station.racks': 'Sunucu Kabinleri',
    'station.falls': 'Veri Şelaleleri',
    'station.portal': 'Geçit Halkası',
    'station.arcade': 'Oyun Makinesi',

    'effort.low': 'düşük',
    'effort.medium': 'orta',
    'effort.high': 'yüksek',
    'effort.xhigh': 'çok yüksek',
    'effort.max': 'maksimum',

    'act.none': 'Olaylar bekleniyor',
    'act.idle': 'Boşta',
    'act.thinking': 'Düşünüyor…',
    'act.ended': 'Oturum bitti',
    'act.error': 'Hata[ ({error})]',
    'act.waiting': 'İzin Bekliyor[ ({tool})]',
    'act.compacting': 'Bağlamı Sıkıştırıyor',
    'act.read': 'Okuyor[ ({target})]',
    'act.search': 'Arıyor[ ({target})]',
    'act.edit': 'Düzenliyor[ ({target})]',
    'act.shell': 'Komut Çalıştırıyor',
    'act.web': "Web'de Arıyor[ ({target})]",
    'act.task': 'Görev Planlıyor',
    'act.agent': 'Görev Devrediyor[ ({target})]',
    'act.other': '{tool} Kullanıyor',

    'log.sessionStart': 'Oturum başladı[ ({source})]',
    'log.prompt': 'Yeni istek',
    'log.read': '[{target} ]okunuyor...',
    'log.search': 'Aranıyor[: {target}]',
    'log.edit': '[{target} ]düzenleniyor...',
    'log.write': '[{target} ]yazılıyor...',
    'log.shell': 'Komut çalışıyor[: {target}]',
    'log.webFetch': '[{target} ]getiriliyor...',
    'log.webSearch': "Web'de aranıyor[: {target}]",
    'log.task': 'Görev listesi güncelleniyor',
    'log.agent': 'Yardımcı gönderiliyor[: {target}]',
    'log.other': '{tool} kullanılıyor[: {target}]',
    'log.toolFailed': '{tool} başarısız[: {error}]',
    'log.interrupted': '{tool} yarıda kesildi',
    'log.permission': 'İzin gerekiyor: {tool}[ ({target})]',
    'log.helperStart': 'Yardımcı başlatıldı[ ({type})]',
    'log.helperStop': 'Yardımcı döndü[ ({type})]',
    'log.preCompact': 'Bağlam sıkıştırılıyor[ ({trigger})]',
    'log.postCompact': 'Bağlam sıkıştırıldı',
    'log.stop': 'Tur tamamlandı',
    'log.stopFailure': 'Tur hatayla bitti[: {error}]',
    'log.sessionEnd': 'Oturum bitti[ ({reason})]',

    'source.startup': 'yeni',
    'source.resume': 'devam',
    'source.clear': '/clear sonrası',
    'source.compact': 'sıkıştırma sonrası',
    'source.fork': 'çatallandı',
    'trigger.auto': 'otomatik',
    'trigger.manual': 'elle',
    'reason.clear': '/clear',
    'reason.resume': 'devam',
    'reason.logout': 'oturum kapatıldı',
    'reason.prompt_input_exit': 'çıkış',
    'reason.other': 'diğer',
    'error.rate_limit': 'hız sınırı',
    'error.overloaded': 'aşırı yük',
    'error.authentication_failed': 'kimlik doğrulama hatası',
    'error.billing_error': 'ödeme hatası',
    'error.server_error': 'sunucu hatası',
    'error.max_output_tokens': 'çıktı sınırı',
    'error.unknown': 'bilinmiyor',

    'unit.h': 'sa',
    'unit.m': 'dk',
    'unit.s': 'sn',
  },
};

export function keysOf(lang) {
  return Object.keys(STRINGS[lang] ?? {});
}

/**
 * Returns t(key, params) -> string, with helpers:
 *   t.parts(key, params) -> array of strings and {v} values (so values can be styled),
 *   t.word(group, value) -> translated enum value ("effort", "high") or the raw value.
 */
export function makeTranslator(lang) {
  const table = STRINGS[lang] ?? STRINGS.en;
  const has = (v) => v !== undefined && v !== null && v !== '';

  function parts(key, params = {}) {
    const template = (table[key] ?? STRINGS.en[key] ?? key).replace(/\[([^\]]*)\]/g, (_, inner) =>
      [...inner.matchAll(/\{(\w+)\}/g)].every((m) => has(params[m[1]])) ? inner : '');
    const out = [];
    let last = 0;
    for (const m of template.matchAll(/\{(\w+)\}/g)) {
      if (m.index > last) out.push(template.slice(last, m.index));
      out.push({ v: String(params[m[1]] ?? '') });
      last = m.index + m[0].length;
    }
    if (last < template.length) out.push(template.slice(last));
    return out;
  }

  const t = (key, params) => parts(key, params).map((p) => (typeof p === 'string' ? p : p.v)).join('');
  t.lang = table === STRINGS[lang] ? lang : 'en';
  t.parts = parts;
  t.word = (group, value) => (has(value) ? table[`${group}.${value}`] ?? value : undefined);
  return t;
}
