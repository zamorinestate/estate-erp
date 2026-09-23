// =============================================================================
// ZAMORIN CAFÉ ERP — MULTI-LANGUAGE LOCALISATION ENGINE (i18n)
// English (EN), Malayalam (ML - മലയാളം), Kannada (KN - ಕನ್ನಡ), Hindi (HI - हिन्दी)
// =============================================================================

const STORAGE_KEY = 'zamorin-lang';

export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', flag: '🇮🇳' },
];

export const DICTIONARY = {
  en: {
    // Actions
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    settle: 'Settle',
    refresh: 'Refresh',
    download: 'Download',
    upload: 'Upload',
    search: 'Search...',
    filter: 'Filter',
    close: 'Close',
    submit: 'Submit',
    loading: 'Loading...',
    status: 'Status',
    date: 'Date',
    amount: 'Amount',
    total: 'Total',

    // Navigation
    dashboard: 'Command Centre',
    pos: 'POS & Till',
    attendance: 'Attendance & Shifts',
    inventory: 'Inventory Master',
    procurement: 'Procurement & Orders',
    assets: 'Assets & Maintenance',
    quality: 'Quality & Compliance',
    employees: 'Employee Directory',
    payroll: 'Universal Payroll',
    bills: 'Bills & Receipts',
    expenses: 'Expenses & Petty Cash',
    finance: 'Finance & Ledger',
    passbook: 'Treasury Passbook',
    ledger: 'Personal Ledger',
    customers: 'Customer CRM',
    menu: 'Menu & Recipes',
    vendors: 'Suppliers & Vendors',
    revenueShare: 'Revenue Share',
    reports: 'Reports & Analytics',
    admin: 'System Administration',
    settings: 'Settings & Preferences',
    notifications: 'Notification Centre',
    staffHome: 'Staff Portal',

    // POS & Till
    newOrder: 'New Order',
    dineIn: 'Dine-In',
    takeaway: 'Takeaway',
    delivery: 'Delivery',
    pay: 'Pay',
    cash: 'Cash',
    upi: 'UPI / QR',
    card: 'Card',
    settleTill: 'Settle Till',

    // Attendance Kiosk
    clockIn: 'Clock In',
    clockOut: 'Clock Out',
    breakStart: 'Start Break',
    breakEnd: 'End Break',
    shiftStatus: 'Shift Status',
    onDuty: 'On Duty',
    offDuty: 'Off Duty',
  },

  ml: {
    // Actions
    save: 'സൂക്ഷിക്കുക',
    cancel: 'റദ്ദാക്കുക',
    confirm: 'സ്ഥിരീകരിക്കുക',
    delete: 'നീക്കം ചെയ്യുക',
    edit: 'തിരുത്തുക',
    back: 'പിന്നോട്ട്',
    settle: 'സെറ്റിൽ ചെയ്യുക',
    refresh: 'പുതുക്കുക',
    download: 'ഡൗൺലോഡ്',
    upload: 'അപ്‌ലോഡ്',
    search: 'തിരയുക...',
    filter: 'ഫിൽട്ടർ',
    close: 'അടയ്ക്കുക',
    submit: 'സമർപ്പിക്കുക',
    loading: 'പ്രവർത്തിക്കുന്നു...',
    status: 'നില',
    date: 'തീയതി',
    amount: 'തുക',
    total: 'ആകെ',

    // Navigation
    dashboard: 'കമാൻഡ് സെന്റർ',
    pos: 'പി.ഒ.എസ് ബില്ലിംഗ്',
    attendance: 'ഹാജർ & ഷിഫ്റ്റുകൾ',
    inventory: 'ഇൻവെന്ററി',
    procurement: 'വാങ്ങലുകൾ & ഓർഡറുകൾ',
    assets: 'ഉപകരണങ്ങൾ & അറ്റകുറ്റപ്പണി',
    quality: 'ഗുണനിലവാരം & പരിശോധന',
    employees: 'ജീവനക്കാരുടെ പട്ടിക',
    payroll: 'ശമ്പള വിതരണം',
    bills: 'ബില്ലുകൾ & രസീതുകൾ',
    expenses: 'ചെലവുകൾ',
    finance: 'ധനകാര്യം & അക്കൗണ്ടുകൾ',
    passbook: 'പാസ്ബുക്ക്',
    ledger: 'പേഴ്സണൽ ലെഡ്ജർ',
    customers: 'ഉപഭോക്താക്കൾ',
    menu: 'വിഭവങ്ങളുടെ മെനു',
    vendors: 'വിതരണക്കാർ',
    revenueShare: 'വരുമാന വിഹിതം',
    reports: 'റിപ്പോർട്ടുകൾ & വിശകലനം',
    admin: 'അഡ്മിനിസ്ട്രേഷൻ',
    settings: 'ക്രമീകരണങ്ങൾ',
    notifications: 'അറിയിപ്പുകൾ',
    staffHome: 'സ്റ്റാഫ് പോർട്ടൽ',

    // POS & Till
    newOrder: 'പുതിയ ഓർഡർ',
    dineIn: 'ഡൈൻ-ഇൻ',
    takeaway: 'പാഴ്സൽ',
    delivery: 'ഡെലിവറി',
    pay: 'പണം അടയ്ക്കുക',
    cash: 'പണം (Cash)',
    upi: 'യു.പി.ഐ / ക്യു.ആർ',
    card: 'കാർഡ് (Card)',
    settleTill: 'കണക്ക് തീർക്കുക (Settle Till)',

    // Attendance Kiosk
    clockIn: 'ഡ്യൂട്ടി ആരംഭിക്കുക (Clock In)',
    clockOut: 'ഡ്യൂട്ടി പൂർത്തിയാക്കുക (Clock Out)',
    breakStart: 'ഇടവേള ആരംഭിക്കുക',
    breakEnd: 'ഇടവേള പൂർത്തിയാക്കുക',
    shiftStatus: 'ഷിഫ്റ്റ് നില',
    onDuty: 'ഡ്യൂട്ടിയിൽ',
    offDuty: 'ഡ്യൂട്ടിയിലല്ല',
  },

  kn: {
    // Actions
    save: 'ಉಳಿಸಿ',
    cancel: 'ರದ್ದುಮಾಡಿ',
    confirm: 'ದೃಢೀಕರಿಸಿ',
    delete: 'ಅಳಿಸಿ',
    edit: 'ತಿದ್ದು',
    back: 'ಹಿಂದೆ',
    settle: 'ಸೆಟಲ್ ಮಾಡಿ',
    refresh: 'ನವೀಕರಿಸಿ',
    download: 'ಡೌನ್‌ಲೋಡ್',
    upload: 'ಅಪ್‌ಲೋಡ್',
    search: 'ಹುಡುಕಿ...',
    filter: 'ಫಿಲ್ಟರ್',
    close: 'ಮುಚ್ಚಿ',
    submit: 'ಸಲ್ಲಿಸಿ',
    loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...',
    status: 'ಸ್ಥಿತಿ',
    date: 'ದಿನಾಂಕ',
    amount: 'ಮೊತ್ತ',
    total: 'ಒಟ್ಟು',

    // Navigation
    dashboard: 'ಕಮಾಂಡ್ ಸೆಂಟರ್',
    pos: 'ಪಿಒಎಸ್ ಬಿಲ್ಲಿಂಗ್',
    attendance: 'ಹಾಜರಾತಿ ಮತ್ತು ಶಿಫ್ಟ್‌ಗಳು',
    inventory: 'ದಾಸ್ತಾನು (Inventory)',
    procurement: 'ಖರೀದಿ ಮತ್ತು ಆದೇಶಗಳು',
    assets: 'ಸ್ವತ್ತುಗಳು ಮತ್ತು ನಿರ್ವಹಣೆ',
    quality: 'ಗುಣಮಟ್ಟ ಮತ್ತು ತಪಾಸಣೆ',
    employees: 'ಉದ್ಯೋಗಿಗಳ ಡೈರೆಕ್ಟರಿ',
    payroll: 'ವೇತನ ನಿರ್ವಹಣೆ',
    bills: 'ಬಿಲ್ಲುಗಳು ಮತ್ತು ರಸೀದಿಗಳು',
    expenses: 'ವೆಚ್ಚಗಳು',
    finance: 'ಹಣಕಾಸು ಮತ್ತು ಲೆಡ್ಜರ್',
    passbook: 'ಖಾತೆ ಪಾಸ್‌ಬುಕ್',
    ledger: 'ವೈಯಕ್ತಿಕ ಲೆಡ್ಜರ್',
    customers: 'ಗ್ರಾಹಕರ ಪಟ್ಟಿ',
    menu: 'ಮೆನು ಮತ್ತು ಪಾಕವಿಧಾನಗಳು',
    vendors: 'ಮಾರಾಟಗಾರರು',
    revenueShare: 'ಆದಾಯ ಹಂಚಿಕೆ',
    reports: 'ವರದಿಗಳು ಮತ್ತು ಅಂಕಿಅಂಶ',
    admin: 'ಆಡಳಿತ ನಿರ್ವಹಣೆ',
    settings: 'ಆದ್ಯತೆಗಳು ಮತ್ತು ಸೆಟ್ಟಿಂಗ್ಸ್',
    notifications: 'ಸೂಚನೆಗಳು',
    staffHome: 'ಸಿಬ್ಬಂದಿ ಪೋರ್ಟಲ್',

    // POS & Till
    newOrder: 'ಹೊಸ ಆರ್ಡರ್',
    dineIn: 'ಡೈನ್-ಇನ್',
    takeaway: 'ಪಾರ್ಸೆಲ್',
    delivery: 'ಡೆಲಿವರಿ',
    pay: 'ಪಾವತಿಸಿ',
    cash: 'ನಗದು (Cash)',
    upi: 'ಯುಪಿಐ / ಕ್ಯೂಆರ್',
    card: 'ಕಾರ್ಡ್ (Card)',
    settleTill: 'ಲೆಕ್ಕ ಇತ್ಯರ್ಥ (Settle Till)',

    // Attendance Kiosk
    clockIn: 'ಹಾಜರಾಗು (Clock In)',
    clockOut: 'ನಿರ್ಗಮಿಸು (Clock Out)',
    breakStart: 'ವಿರಾಮ ಆರಂಭ',
    breakEnd: 'ವಿರಾಮ ಮುಕ್ತಾಯ',
    shiftStatus: 'ಶಿಫ್ಟ್ ಸ್ಥಿತಿ',
    onDuty: 'ಕರ್ತವ್ಯದಲ್ಲಿದ್ದಾರೆ',
    offDuty: 'ರಜೆಯಲ್ಲಿದ್ದಾರೆ',
  },

  hi: {
    // Actions
    save: 'सहेजें',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
    delete: 'हटाएं',
    edit: 'संपादित करें',
    back: 'वापस',
    settle: 'निपटान करें',
    refresh: 'ताज़ा करें',
    download: 'डाउनलोड',
    upload: 'अपलोड',
    search: 'खोजें...',
    filter: 'फ़िल्टर',
    close: 'बंद करें',
    submit: 'जमा करें',
    loading: 'लोड हो रहा है...',
    status: 'स्थिति',
    date: 'दिनांक',
    amount: 'राशि',
    total: 'कुल योग',

    // Navigation
    dashboard: 'कमांड सेंटर',
    pos: 'पीओएस बिलिंग',
    attendance: 'उपस्थिति एवं शिफ्ट',
    inventory: 'इन्वेंट्री प्रबंधन',
    procurement: 'खरीद एवं आदेश',
    assets: 'परिसंपत्ति एवं रखरखाव',
    quality: 'गुणवत्ता एवं निरीक्षण',
    employees: 'कर्मचारी सूची',
    payroll: 'वेतन प्रबंधन',
    bills: 'बिल एवं रसीदें',
    expenses: 'खर्च एवं अग्रिम',
    finance: 'वित्त एवं खाता बही',
    passbook: 'कोषागार पासबुक',
    ledger: 'व्यक्तिगत बहीखाता',
    customers: 'ग्राहक संबंध (CRM)',
    menu: 'मेन्यू एवं रेसिपी',
    vendors: 'आपूर्तिकर्ता एवं विक्रेता',
    revenueShare: 'राजस्व सहभाजन',
    reports: 'रिपोर्ट्स एवं विश्लेषण',
    admin: 'प्रणाली प्रशासन',
    settings: 'सेटिंग्स एवं प्राथमिकताएं',
    notifications: 'अधिसूचना केंद्र',
    staffHome: 'स्टाफ पोर्टल',

    // POS & Till
    newOrder: 'नया ऑर्डर',
    dineIn: 'डाइन-इन',
    takeaway: 'पार्सल / ले जाएं',
    delivery: 'होम डिलीवरी',
    pay: 'भुगतान करें',
    cash: 'नकद (Cash)',
    upi: 'यूपीआई / क्यूआर कोड',
    card: 'कार्ड (Card)',
    settleTill: 'कैश बॉक्स सेटल करें',

    // Attendance Kiosk
    clockIn: 'उपस्थिति दर्ज करें (Clock In)',
    clockOut: 'ड्यूटी समाप्त करें (Clock Out)',
    breakStart: 'विराम आरंभ',
    breakEnd: 'विराम समाप्त',
    shiftStatus: 'शिफ्ट स्थिति',
    onDuty: 'ड्यूटी पर',
    offDuty: 'ड्यूटी से बाहर',
  },

  ta: {
    // Actions
    save: 'சேமிக்க',
    cancel: 'ரத்து செய்',
    confirm: 'உறுதிப்படுத்து',
    delete: 'நீக்கு',
    edit: 'திருத்து',
    back: 'பின்னால்',
    settle: 'செட்டில் செய்',
    refresh: 'புதுப்பிக்கு',
    download: 'பதிவிறக்கு',
    upload: 'பதிவேற்று',
    search: 'தேடுக...',
    filter: 'வடிகட்டு',
    close: 'மூடு',
    submit: 'சமர்ப்பி',
    loading: 'ஏற்றுகிறது...',
    status: 'நிலை',
    date: 'தேதி',
    amount: 'தொகை',
    total: 'மொத்தம்',

    // Navigation
    dashboard: 'கட்டளை மையம்',
    pos: 'பி.ஓ.எஸ் பில்லிங்',
    attendance: 'வருகை & ஷிப்டுகள்',
    inventory: 'சரக்கு இருப்பு (Inventory)',
    procurement: 'கொள்முதல் & ஆர்டர்கள்',
    assets: 'சொத்துக்கள் & பராமரிப்பு',
    quality: 'தரம் & இணக்கம்',
    employees: 'பணியாளர்கள் விவரம்',
    payroll: 'சம்பளப் பட்டியல்',
    bills: 'பில்கள் & ரசீதுகள்',
    expenses: 'செலவுகள்',
    finance: 'நிதி & கணக்குகள்',
    passbook: 'பாஸ்புக்',
    ledger: 'தனிப்பட்ட லெட்ஜர்',
    customers: 'வாடிக்கையாளர்கள்',
    menu: 'மெனு & ரெசிபி',
    vendors: 'விற்பனையாளர்கள்',
    revenueShare: 'வருவாய் பகிர்வு',
    reports: 'அறிக்கைகள் & பகுப்பாய்வு',
    admin: 'கணினி நிர்வாகம்',
    settings: 'அமைப்புகள் & விருப்பங்கள்',
    notifications: 'அறிவிப்புகள்',
    staffHome: 'பணியாளர் தளம்',

    // POS & Till
    newOrder: 'புதிய ஆர்டர்',
    dineIn: 'உணவருந்து (Dine-In)',
    takeaway: 'பார்சல் (Takeaway)',
    delivery: 'டெலிவரி',
    pay: 'பணம் செலுத்து',
    cash: 'ரொக்கம் (Cash)',
    upi: 'யுபிஐ / கியூஆர்',
    card: 'கார்டு (Card)',
    settleTill: 'கணக்கு தீர்வு (Settle Till)',

    // Attendance Kiosk
    clockIn: 'பணி ஆரம்பம் (Clock In)',
    clockOut: 'பணி நிறைவு (Clock Out)',
    breakStart: 'இடைவேளை தொடங்கு',
    breakEnd: 'இடைவேளை முடி',
    shiftStatus: 'ஷிப்ட் நிலை',
    onDuty: 'பணியில்',
    offDuty: 'விடுப்பில்',
  },
};

let currentLang = 'en';

export function initLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARY[saved]) {
      currentLang = saved;
    }
  } catch {
    currentLang = 'en';
  }
  document.documentElement.setAttribute('lang', currentLang);
  return currentLang;
}

export function getCurrentLanguage() {
  return currentLang;
}

export function setLanguage(lang) {
  if (!DICTIONARY[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.documentElement.setAttribute('lang', lang);
  window.dispatchEvent(new CustomEvent('zamorin-language-changed', { detail: { lang } }));
}

export function t(key, fallback = '') {
  const dict = DICTIONARY[currentLang] || DICTIONARY.en;
  return dict[key] || DICTIONARY.en[key] || fallback || key;
}
