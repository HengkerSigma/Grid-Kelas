/**
 * Grid-Kelas greeting and presence helpers.
 * Pure functions only: no timers, DOM, database, or application state.
 */
const BIRTHDAY_DEFAULT_MESSAGES = Object.freeze([
  'Semoga selalu sehat, bahagia, dan semua urusan kuliahmu dilancarkan!',
  'Semoga di usia baru ini makin banyak hal baik, prestasi, dan pengalaman seru.',
  'Semoga semua target dan cita-citamu tercapai. Tetap semangat menjalani perkuliahan!',
  'Panjang umur, sehat selalu, dan semoga setiap langkahmu membawa hal baik.',
  'Semoga tahun ini penuh kesempatan baru, nilai yang memuaskan, dan kebahagiaan.',
  'Semoga makin sukses, makin kuat menghadapi tugas, dan jangan lupa menikmati prosesnya!'
]);

function greetingText(name, birthday, jakarta) {
  const parts = jakarta || {};
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const safeName = String(name || 'Mahasiswa');
  if (birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) && birthday.slice(5) === String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0')) {
    return { title: 'Selamat Ulang Tahun, ' + safeName + '! 🎂', subtitle: 'Semoga tahun ini penuh pencapaian dan hal baik. Have a great lap!' };
  }
  if (minutes >= 240 && minutes <= 600) return { title: 'Selamat Pagi, ' + safeName, subtitle: 'Semangat menjalani hari!' };
  if (minutes >= 601 && minutes <= 899) return { title: 'Selamat Siang, ' + safeName, subtitle: 'Bagaimana hari ini?' };
  if (minutes >= 900 && minutes <= 1079) return { title: 'Selamat Sore, ' + safeName, subtitle: 'Bagaimana hari ini?' };
  if (minutes >= 1080 && minutes <= 1319) return { title: 'Selamat Malam, ' + safeName, subtitle: 'Kerja bagus hari ini, jangan lupa istirahat, ya!' };
  return { title: 'Selamat Malam, ' + safeName, subtitle: 'Ini waktunya istirahat!' };
}

function presenceOnline(records, no, now, ttl) {
  return Object.values(records || {}).some(p => Number(p.no) === Number(no) && Number(p.lastSeen) > 0 && now - Number(p.lastSeen) < ttl);
}

function countOnlineFriends(records, me, total, now, ttl) {
  let count = 0;
  for (let no = 1; no <= total; no++) {
    if (no !== Number(me) && presenceOnline(records, no, now, ttl)) count++;
  }
  return count;
}

function randomBirthdayMessage(random = Math.random) {
  return BIRTHDAY_DEFAULT_MESSAGES[Math.floor(random() * BIRTHDAY_DEFAULT_MESSAGES.length)];
}

function defaultBirthdayMessage(date, no) {
  const seed = String(date) + ':' + String(no);
  const hash = Array.from(seed).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 7);
  return BIRTHDAY_DEFAULT_MESSAGES[hash % BIRTHDAY_DEFAULT_MESSAGES.length];
}

const greetingUtils = Object.freeze({ greetingText, presenceOnline, countOnlineFriends, randomBirthdayMessage, defaultBirthdayMessage });
if (typeof module === 'object' && module.exports) module.exports = greetingUtils;
if (typeof window !== 'undefined') window.GridKelasGreetingUtils = greetingUtils;
