/**
 * Built-in merchant and keyword knowledge (India-focused). Category names
 * refer to the default category tree seeded for every family; families that
 * renamed or deleted a category simply get no suggestion from that entry.
 */

export type CategoryPath = { category: string; subcategory?: string };

export type MerchantEntry = {
  /** Uppercase tokens or phrases matched against the normalised description. */
  patterns: string[];
  merchant: string;
  path: CategoryPath;
};

export const DEFAULT_MERCHANTS: MerchantEntry[] = [
  // Food
  { patterns: ['SWIGGY INSTAMART', 'INSTAMART'], merchant: 'Swiggy Instamart', path: { category: 'Household', subcategory: 'Groceries' } },
  { patterns: ['SWIGGY'], merchant: 'Swiggy', path: { category: 'Food', subcategory: 'Food delivery' } },
  { patterns: ['ZOMATO'], merchant: 'Zomato', path: { category: 'Food', subcategory: 'Restaurants' } },
  { patterns: ['DOMINOS', 'DOMINO S'], merchant: "Domino's", path: { category: 'Food', subcategory: 'Food delivery' } },
  { patterns: ['MCDONALDS', 'MC DONALDS', 'KFC', 'BURGER KING', 'PIZZA HUT', 'SUBWAY'], merchant: 'Fast food', path: { category: 'Food', subcategory: 'Restaurants' } },
  { patterns: ['STARBUCKS', 'CAFE COFFEE DAY', 'CCD', 'THIRD WAVE', 'BLUE TOKAI', 'CHAAYOS'], merchant: 'Coffee', path: { category: 'Food', subcategory: 'Coffee' } },
  // Groceries
  { patterns: ['BIGBASKET', 'BIG BASKET', 'BBNOW'], merchant: 'BigBasket', path: { category: 'Household', subcategory: 'Groceries' } },
  { patterns: ['BLINKIT', 'GROFERS'], merchant: 'Blinkit', path: { category: 'Household', subcategory: 'Groceries' } },
  { patterns: ['ZEPTO'], merchant: 'Zepto', path: { category: 'Household', subcategory: 'Groceries' } },
  { patterns: ['DMART', 'AVENUE SUPERMARTS', 'RELIANCE FRESH', 'RELIANCE SMART', 'MORE RETAIL', 'SPENCERS', 'NATURES BASKET', 'JIOMART'], merchant: 'Supermarket', path: { category: 'Household', subcategory: 'Groceries' } },
  // Shopping
  { patterns: ['AMAZON PAY', 'AMAZON', 'AMZN'], merchant: 'Amazon', path: { category: 'Family', subcategory: 'Shopping' } },
  { patterns: ['FLIPKART'], merchant: 'Flipkart', path: { category: 'Family', subcategory: 'Shopping' } },
  { patterns: ['MYNTRA', 'AJIO', 'NYKAA FASHION', 'H&M', 'ZARA', 'UNIQLO', 'WESTSIDE', 'LIFESTYLE STORES', 'MAX FASHION'], merchant: 'Clothing', path: { category: 'Lifestyle', subcategory: 'Clothing' } },
  { patterns: ['NYKAA'], merchant: 'Nykaa', path: { category: 'Lifestyle', subcategory: 'Personal care' } },
  { patterns: ['CROMA', 'RELIANCE DIGITAL', 'VIJAY SALES', 'APPLE STORE', 'APPLE.COM'], merchant: 'Electronics', path: { category: 'Lifestyle', subcategory: 'Electronics' } },
  // Transport
  { patterns: ['UBER'], merchant: 'Uber', path: { category: 'Transportation', subcategory: 'Taxi' } },
  { patterns: ['OLA', 'ANI TECHNOLOGIES', 'OLACABS'], merchant: 'Ola', path: { category: 'Transportation', subcategory: 'Taxi' } },
  { patterns: ['RAPIDO'], merchant: 'Rapido', path: { category: 'Transportation', subcategory: 'Taxi' } },
  { patterns: ['NAMMA YATRI', 'BLUSMART'], merchant: 'Cab', path: { category: 'Transportation', subcategory: 'Taxi' } },
  { patterns: ['METRO', 'BMRCL', 'DMRC', 'BEST BUS', 'KSRTC', 'MSRTC', 'TSRTC'], merchant: 'Public transport', path: { category: 'Transportation', subcategory: 'Public transport' } },
  { patterns: ['FASTAG', 'NETC'], merchant: 'FASTag', path: { category: 'Transportation', subcategory: 'Tolls' } },
  { patterns: ['INDIAN OIL', 'IOCL', 'HPCL', 'HP PETROL', 'BPCL', 'BHARAT PETROLEUM', 'SHELL', 'NAYARA', 'JIO BP'], merchant: 'Fuel station', path: { category: 'Transportation', subcategory: 'Fuel' } },
  // Travel
  { patterns: ['IRCTC'], merchant: 'IRCTC', path: { category: 'Lifestyle', subcategory: 'Travel' } },
  { patterns: ['MAKEMYTRIP', 'MAKE MY TRIP', 'GOIBIBO', 'CLEARTRIP', 'YATRA', 'EASEMYTRIP', 'IXIGO', 'AGODA', 'BOOKING.COM', 'AIRBNB', 'OYO'], merchant: 'Travel booking', path: { category: 'Lifestyle', subcategory: 'Travel' } },
  { patterns: ['INDIGO', 'INTERGLOBE', 'AIR INDIA', 'VISTARA', 'AKASA', 'SPICEJET'], merchant: 'Airline', path: { category: 'Lifestyle', subcategory: 'Travel' } },
  // Utilities
  { patterns: ['BESCOM', 'KSEB', 'MSEDCL', 'MAHADISCOM', 'TNEB', 'TANGEDCO', 'TATA POWER', 'ADANI ELECTRICITY', 'BSES', 'CESC', 'TSSPDCL', 'APSPDCL', 'UPPCL', 'PSPCL', 'TPDDL'], merchant: 'Electricity board', path: { category: 'Household', subcategory: 'Electricity' } },
  { patterns: ['BWSSB', 'WATER BOARD', 'JAL BOARD'], merchant: 'Water board', path: { category: 'Household', subcategory: 'Water' } },
  { patterns: ['INDANE', 'HP GAS', 'BHARAT GAS', 'BHARATGAS', 'MAHANAGAR GAS', 'IGL', 'ADANI GAS'], merchant: 'Gas', path: { category: 'Household', subcategory: 'Gas' } },
  { patterns: ['ACT FIBERNET', 'HATHWAY', 'EXCITEL', 'JIOFIBER', 'AIRTEL XSTREAM FIBER', 'TATA PLAY FIBER'], merchant: 'Broadband', path: { category: 'Household', subcategory: 'Internet' } },
  { patterns: ['AIRTEL', 'JIO', 'RELIANCE JIO', 'VODAFONE', 'VI PREPAID', 'BSNL', 'TATA PLAY', 'TATASKY', 'DISH TV'], merchant: 'Mobile & DTH', path: { category: 'Household', subcategory: 'Mobile & DTH' } },
  { patterns: ['URBAN COMPANY', 'URBANCLAP'], merchant: 'Urban Company', path: { category: 'Household', subcategory: 'Maintenance' } },
  // Subscriptions & entertainment
  { patterns: ['NETFLIX', 'SPOTIFY', 'HOTSTAR', 'DISNEY', 'PRIME VIDEO', 'YOUTUBE PREMIUM', 'GOOGLE ONE', 'ICLOUD', 'SONYLIV', 'ZEE5', 'JIOCINEMA'], merchant: 'Subscription', path: { category: 'Lifestyle', subcategory: 'Subscriptions' } },
  { patterns: ['BOOKMYSHOW', 'PVR', 'INOX', 'CINEPOLIS', 'DISTRICT'], merchant: 'Movies & events', path: { category: 'Lifestyle', subcategory: 'Entertainment' } },
  { patterns: ['CULT FIT', 'CULTFIT', 'CURE FIT', 'GOLDS GYM', 'ANYTIME FITNESS'], merchant: 'Fitness', path: { category: 'Lifestyle', subcategory: 'Fitness' } },
  // Health
  { patterns: ['APOLLO PHARMACY', 'PHARMEASY', 'TATA 1MG', '1MG', 'NETMEDS', 'MEDPLUS', 'WELLNESS FOREVER'], merchant: 'Pharmacy', path: { category: 'Family', subcategory: 'Medical' } },
  { patterns: ['APOLLO HOSPITAL', 'FORTIS', 'MANIPAL HOSPITAL', 'NARAYANA', 'MAX HEALTHCARE', 'PRACTO'], merchant: 'Hospital', path: { category: 'Family', subcategory: 'Medical' } },
  // Financial
  { patterns: ['LIC', 'LIFE INSURANCE CORPORATION', 'HDFC LIFE', 'ICICI PRU', 'ICICI LOMBARD', 'STAR HEALTH', 'NIVA BUPA', 'ACKO', 'DIGIT INSURANCE', 'POLICYBAZAAR'], merchant: 'Insurance', path: { category: 'Financial', subcategory: 'Insurance' } },
  { patterns: ['ZERODHA', 'GROWW', 'UPSTOX', 'KUVERA', 'COIN BY ZERODHA', 'INDMONEY', 'SMALLCASE', 'BSE STAR MF', 'CAMS', 'KFINTECH'], merchant: 'Investments', path: { category: 'Financial', subcategory: 'Investment' } },
  { patterns: ['EDUCATION', 'BYJUS', 'UNACADEMY', 'VEDANTU', 'COURSERA', 'UDEMY'], merchant: 'Education', path: { category: 'Family', subcategory: 'Education' } },
];

export type KeywordRule = { keywords: string[]; path: CategoryPath; direction?: 'debit' | 'credit' };

/** Lower-confidence keyword rules, applied when no merchant matched. */
export const DEFAULT_KEYWORDS: KeywordRule[] = [
  { keywords: ['SALARY', 'SAL CREDIT', 'PAYROLL'], path: { category: 'Salary', subcategory: 'Salary' }, direction: 'credit' },
  { keywords: ['BONUS'], path: { category: 'Salary', subcategory: 'Bonus' }, direction: 'credit' },
  { keywords: ['INTEREST', 'INT PD', 'INT CREDIT', 'SB INT'], path: { category: 'Investments', subcategory: 'Interest' }, direction: 'credit' },
  { keywords: ['DIVIDEND', 'DIV'], path: { category: 'Investments', subcategory: 'Dividends' }, direction: 'credit' },
  { keywords: ['CASHBACK', 'REWARD'], path: { category: 'Other income', subcategory: 'Cashback & rewards' }, direction: 'credit' },
  { keywords: ['TAX REFUND', 'ITR REFUND', 'INCOME TAX REFUND'], path: { category: 'Other income', subcategory: 'Tax refund' }, direction: 'credit' },
  { keywords: ['RENT'], path: { category: 'Household', subcategory: 'Rent' }, direction: 'debit' },
  { keywords: ['ELECTRICITY', 'POWER BILL', 'EB BILL'], path: { category: 'Household', subcategory: 'Electricity' }, direction: 'debit' },
  { keywords: ['WATER BILL', 'WATER CHARGES'], path: { category: 'Household', subcategory: 'Water' }, direction: 'debit' },
  { keywords: ['BROADBAND', 'INTERNET', 'WIFI', 'FIBER'], path: { category: 'Household', subcategory: 'Internet' }, direction: 'debit' },
  { keywords: ['MAINTENANCE', 'SOCIETY', 'APARTMENT ASSOCIATION'], path: { category: 'Household', subcategory: 'Maintenance' }, direction: 'debit' },
  { keywords: ['MAID', 'COOK', 'DRIVER SALARY'], path: { category: 'Household', subcategory: 'Domestic help' }, direction: 'debit' },
  { keywords: ['GROCERY', 'GROCERIES', 'SUPERMARKET', 'KIRANA', 'VEGETABLES', 'FRUITS'], path: { category: 'Household', subcategory: 'Groceries' }, direction: 'debit' },
  { keywords: ['RESTAURANT', 'HOTEL', 'DHABA', 'BIRYANI', 'DINE'], path: { category: 'Food', subcategory: 'Restaurants' }, direction: 'debit' },
  { keywords: ['CAFE', 'COFFEE', 'TEA'], path: { category: 'Food', subcategory: 'Coffee' }, direction: 'debit' },
  { keywords: ['BAKERY', 'SWEETS', 'SNACKS', 'CHAAT'], path: { category: 'Food', subcategory: 'Snacks' }, direction: 'debit' },
  { keywords: ['PETROL', 'DIESEL', 'FUEL', 'FILLING STATION', 'PETROLEUM'], path: { category: 'Transportation', subcategory: 'Fuel' }, direction: 'debit' },
  { keywords: ['PARKING'], path: { category: 'Transportation', subcategory: 'Parking' }, direction: 'debit' },
  { keywords: ['TOLL'], path: { category: 'Transportation', subcategory: 'Tolls' }, direction: 'debit' },
  { keywords: ['SERVICE CENTER', 'SERVICE CENTRE', 'CAR WASH', 'TYRES', 'MOTORS'], path: { category: 'Transportation', subcategory: 'Car maintenance' }, direction: 'debit' },
  { keywords: ['SCHOOL', 'SCHOOL FEE', 'TUITION', 'COLLEGE', 'ACADEMY', 'UNIVERSITY'], path: { category: 'Family', subcategory: 'Education' }, direction: 'debit' },
  { keywords: ['DAYCARE', 'CRECHE', 'PLAYSCHOOL'], path: { category: 'Family', subcategory: 'Childcare' }, direction: 'debit' },
  { keywords: ['HOSPITAL', 'CLINIC', 'PHARMACY', 'MEDICAL', 'DIAGNOSTIC', 'LAB', 'DENTAL', 'CHEMIST'], path: { category: 'Family', subcategory: 'Medical' }, direction: 'debit' },
  { keywords: ['EMI', 'LOAN'], path: { category: 'Financial', subcategory: 'EMI' }, direction: 'debit' },
  { keywords: ['INSURANCE', 'PREMIUM', 'POLICY'], path: { category: 'Financial', subcategory: 'Insurance' }, direction: 'debit' },
  { keywords: ['SIP', 'MUTUAL FUND', 'MF'], path: { category: 'Financial', subcategory: 'Investment' }, direction: 'debit' },
  { keywords: ['ANNUAL FEE', 'LATE FEE', 'FINANCE CHARGE', 'GST ON', 'OVERLIMIT'], path: { category: 'Financial', subcategory: 'Credit card fees' }, direction: 'debit' },
  { keywords: ['SMS CHARGES', 'ATM CHARGES', 'SERVICE CHARGE', 'MIN BAL'], path: { category: 'Financial', subcategory: 'Bank charges' }, direction: 'debit' },
  { keywords: ['SALON', 'SPA', 'PARLOUR', 'BARBER'], path: { category: 'Lifestyle', subcategory: 'Personal care' }, direction: 'debit' },
  { keywords: ['GYM', 'FITNESS', 'YOGA'], path: { category: 'Lifestyle', subcategory: 'Fitness' }, direction: 'debit' },
  { keywords: ['MOVIE', 'CINEMA', 'CONCERT'], path: { category: 'Lifestyle', subcategory: 'Entertainment' }, direction: 'debit' },
  { keywords: ['FLIGHT', 'AIRLINES', 'RAILWAY', 'TRAVELS', 'RESORT'], path: { category: 'Lifestyle', subcategory: 'Travel' }, direction: 'debit' },
  { keywords: ['DONATION', 'CHARITY', 'TEMPLE', 'MOSQUE', 'CHURCH', 'GURUDWARA', 'ZAKAT'], path: { category: 'Other', subcategory: 'Charity' }, direction: 'debit' },
];
