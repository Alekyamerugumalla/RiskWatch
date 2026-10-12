// Synthetic, hand-labelled dataset for FreshKart (a fictional brand).
// No real accounts are scraped: a production system would feed this same shape from
// platform APIs / partner data feeds. Logo "hashes" are 64-bit perceptual hashes; copies of
// the official logo differ by only a few bits, unrelated logos by many.
//
// label:          'fake' | 'legit' | 'borderline'  (borderline is excluded from precision/recall)
// truthCampaign:  ground-truth scammer group, used only by eval.js to test clustering.

import { OFFICIAL_LOGO_HASH as LOGO, OFFICIAL_CERT } from './brand.js';

/** Return `hex` with exactly `n` bits flipped (deterministic). */
function flip(hex, n, seed = 1) {
  const bits = hex
    .split('')
    .map((h) => parseInt(h, 16).toString(2).padStart(4, '0'))
    .join('')
    .split('');
  const used = new Set();
  let s = (seed * 7919) >>> 0;
  while (used.size < n) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0; // 32-bit integer LCG
    used.add((s >>> 16) % bits.length); // use the high bits (low bits of an LCG cycle quickly)
  }
  used.forEach((i) => (bits[i] = bits[i] === '0' ? '1' : '0'));
  let out = '';
  for (let i = 0; i < bits.length; i += 4) out += parseInt(bits.slice(i, i + 4).join(''), 2).toString(16);
  return out;
}
const far = (seed) => flip(LOGO, 30, seed); // clearly a different logo

const account = (o) => ({
  type: 'account',
  verified: false,
  link: '',
  recentPosts: [],
  truthCampaign: null,
  ...o,
});

const APK = 'https://freshkart-refund-help.xyz/FreshKart_Refund_Helper.apk';

export const accounts = [
  // ---------- Official ----------
  account({
    id: 'acc-01', platform: 'instagram', handle: 'freshkart_in', displayName: 'FreshKart',
    bio: 'Fresh groceries delivered in 30 mins. We never ask for OTP, PIN or card details. Support: help.freshkart.in',
    verified: true, createdDaysAgo: 2200, followers: 1200000, following: 120, posts: 2400, logoHash: LOGO,
    link: 'https://freshkart.in',
    recentPosts: ['Monsoon sale is live in the FreshKart app!', 'Reminder: FreshKart will never ask you to share your OTP or install apps from links.'],
    label: 'legit',
  }),
  account({
    id: 'acc-02', platform: 'x', handle: 'freshkart_care', displayName: 'FreshKart Care',
    bio: 'Official customer support. Call 1800-123-4567 (toll free). Beware of fake support accounts.',
    verified: true, createdDaysAgo: 1900, followers: 210000, following: 40, posts: 18000, logoHash: LOGO,
    link: 'https://help.freshkart.in',
    recentPosts: ['Sorry for the delay! Please DM your order ID and we will look into it.'],
    label: 'legit',
  }),

  // ---------- Campaign A: fake refund + APK ----------
  account({
    id: 'acc-03', platform: 'instagram', handle: 'freshkart_support_help', displayName: 'FreshKart Support',
    bio: 'Order failed? Get instant refund. DM us', createdDaysAgo: 3, followers: 140, following: 2100, posts: 4,
    logoHash: flip(LOGO, 2, 1), link: APK,
    recentPosts: [
      'Your order failed! Contact support to get a refund immediately. Download the refund helper apk from the link in bio.',
      'Pay ₹10 verification fee to claim refund within 24 hours',
    ],
    label: 'fake', truthCampaign: 'A',
  }),
  account({
    id: 'acc-04', platform: 'instagram', handle: 'freshkart.refund.center', displayName: 'FreshKart Refund Center',
    bio: 'Official refund desk for failed orders', createdDaysAgo: 6, followers: 95, following: 1800, posts: 3,
    logoHash: flip(LOGO, 4, 2), link: APK,
    recentPosts: ['Failed order refund? Install our refund helper app now, last chance today.'],
    label: 'fake', truthCampaign: 'A',
  }),
  account({
    id: 'acc-05', platform: 'facebook', handle: 'freshkart.customer.care.in', displayName: 'FreshKart Customer Care',
    bio: 'Customer care for FreshKart orders', createdDaysAgo: 11, followers: 310, following: 950, posts: 7,
    logoHash: flip(LOGO, 3, 3),
    recentPosts: [`Refund stuck? Download the helper: ${APK} and enter your UPI PIN to receive money`],
    label: 'fake', truthCampaign: 'A',
  }),
  account({
    id: 'acc-06', platform: 'x', handle: 'fr3shkart_help', displayName: 'FreshKart Help',
    bio: 'Instant help for your orders', createdDaysAgo: 9, followers: 60, following: 1500, posts: 5,
    logoHash: flip(LOGO, 3, 4),
    recentPosts: [`Get your refund within 24 hours. Install ${APK}`],
    label: 'fake', truthCampaign: 'A',
  }),

  // ---------- Campaign B: KYC / wallet / UPI ----------
  account({
    id: 'acc-07', platform: 'telegram', handle: 'freshkart_kyc_update', displayName: 'FreshKart KYC Update',
    bio: 'Update your KYC to keep your wallet active', createdDaysAgo: 15, followers: 480, following: 0, posts: 9,
    logoHash: flip(LOGO, 5, 5),
    recentPosts: ['Your FreshKart wallet will be blocked in 24 hours. Complete KYC now. Share your Aadhaar and OTP on WhatsApp +91 98765 43210'],
    label: 'fake', truthCampaign: 'B',
  }),
  account({
    id: 'acc-08', platform: 'instagram', handle: 'freshkart_wallet_verify', displayName: 'FreshKart Wallet',
    bio: 'Wallet verification desk', createdDaysAgo: 22, followers: 220, following: 1200, posts: 11,
    logoHash: flip(LOGO, 5, 6),
    recentPosts: ['Pay ₹49 security deposit to freshkart.kyc@okaxis to reactivate your wallet. WhatsApp 9876543210'],
    label: 'fake', truthCampaign: 'B',
  }),
  account({
    id: 'acc-09', platform: 'x', handle: 'freshkartwa11et', displayName: 'FreshKart Wallet Support',
    bio: 'Wallet support 24x7', createdDaysAgo: 5, followers: 35, following: 600, posts: 2,
    logoHash: flip(LOGO, 6, 7),
    recentPosts: ['Verify your account urgently: send your OTP on wa.me/919876543210'],
    label: 'fake', truthCampaign: 'B',
  }),

  // ---------- Campaign C: lucky draw / work-from-home ----------
  account({
    id: 'acc-10', platform: 'instagram', handle: 'freshkart_lucky_draw', displayName: 'FreshKart Lucky Draw',
    bio: 'Win free vouchers every day', createdDaysAgo: 8, followers: 410, following: 1900, posts: 6,
    logoHash: flip(LOGO, 4, 8),
    recentPosts: ["You've won a free voucher of ₹5000! Join t.me/freshkart_rewards_official and pay ₹99 registration fee"],
    label: 'fake', truthCampaign: 'C',
  }),
  account({
    id: 'acc-11', platform: 'facebook', handle: 'freshkart.rewards', displayName: 'FreshKart Rewards',
    bio: 'Daily cashback and reward points', createdDaysAgo: 30, followers: 760, following: 1300, posts: 14,
    logoHash: flip(LOGO, 6, 9), link: 'https://t.me/freshkart_rewards_official',
    recentPosts: ['Claim your cashback now, click the link in bio. Expires today!'],
    label: 'fake', truthCampaign: 'C',
  }),
  account({
    id: 'acc-12', platform: 'telegram', handle: 'freshkart_rewards_official', displayName: 'FreshKart Rewards Official',
    bio: 'Official rewards group', createdDaysAgo: 12, followers: 1500, following: 0, posts: 20,
    logoHash: flip(LOGO, 5, 10),
    recentPosts: ['Guaranteed income: work from home as a FreshKart partner. Pay registration fee ₹2,500 and DM us'],
    label: 'fake', truthCampaign: 'C',
  }),

  // ---------- Lone fakes ----------
  account({
    id: 'acc-13', platform: 'instagram', handle: 'freshkart_franchise_in', displayName: 'FreshKart Franchise',
    bio: 'Own a FreshKart franchise today. Advance payment to UPI freshkart.franchise@ybl', createdDaysAgo: 20,
    followers: 180, following: 700, posts: 8, logoHash: flip(LOGO, 7, 11),
    recentPosts: ['Limited franchise slots. Send advance payment ₹25,000 and DM us to book.'],
    label: 'fake',
  }),
  account({
    id: 'acc-14', platform: 'facebook', handle: 'rahul.mehta.freshkart', displayName: 'Rahul Mehta - CEO FreshKart',
    bio: 'CEO at FreshKart. Message me for partnerships', createdDaysAgo: 40, followers: 300, following: 900, posts: 6,
    logoHash: far(12),
    recentPosts: ['Partnership offer: send ₹15,000 onboarding fee to confirm your supplier slot on WhatsApp 9123456780'],
    label: 'fake',
  }),
  account({
    id: 'acc-15', platform: 'x', handle: 'fresh_kart_offers', displayName: 'Fresh Kart Offers',
    bio: 'Daily deals and free delivery coupons', createdDaysAgo: 18, followers: 120, following: 1600, posts: 9,
    logoHash: flip(LOGO, 7, 13), link: 'https://bit.ly/fk-deals-now',
    recentPosts: ['Free voucher! Click here to claim cashback, expires today'],
    label: 'fake',
  }),

  // ---------- Hard negatives (legitimate or harmless but easy to mis-flag) ----------
  account({
    id: 'acc-16', platform: 'instagram', handle: 'freshkart_foodie_reviews', displayName: 'FreshKart Foodie Reviews',
    bio: 'Unofficial fan page. Not affiliated with FreshKart. Honest reviews', createdDaysAgo: 900,
    followers: 18400, following: 310, posts: 640, logoHash: far(14),
    recentPosts: ['Tried the FreshKart organic mangoes today, super fresh!'],
    label: 'legit',
  }),
  account({
    id: 'acc-17', platform: 'x', handle: 'priya_s_blr', displayName: 'Priya S',
    bio: 'Bengaluru | coffee | cricket', createdDaysAgo: 1400, followers: 520, following: 480, posts: 3200, logoHash: far(15),
    recentPosts: ['My FreshKart order was late again, @freshkart_care please fix. Refund pending since Monday.'],
    label: 'legit',
  }),
  account({
    id: 'acc-18', platform: 'instagram', handle: 'freshmart_groceries', displayName: 'FreshMart Groceries',
    bio: 'Neighbourhood grocery store in Pune. Open 8am-9pm.', createdDaysAgo: 1100,
    followers: 3200, following: 400, posts: 380, logoHash: far(16), link: 'https://freshmartpune.in',
    recentPosts: ['Fresh vegetables arrive every morning at 7am.'],
    label: 'legit',
  }),
  account({
    id: 'acc-19', platform: 'facebook', handle: 'kartfresh_organics', displayName: 'Kartfresh Organics',
    bio: 'Farm produce straight from Nashik', createdDaysAgo: 700, followers: 2100, following: 150, posts: 210, logoHash: far(17),
    recentPosts: ['New batch of organic jaggery available.'],
    label: 'legit',
  }),
  account({
    id: 'acc-20', platform: 'instagram', handle: 'freshkart_deals_blog', displayName: 'FreshKart Deals Blog',
    bio: 'Coupons and deals roundup (affiliate links). Not run by FreshKart.', createdDaysAgo: 260,
    followers: 2100, following: 380, posts: 190, logoHash: far(18), link: 'https://dealsroundup.in/freshkart',
    recentPosts: ['This week: 10% off on FreshKart orders above ₹499 with the app coupon.'],
    label: 'borderline',
  }),
  account({
    id: 'acc-21', platform: 'x', handle: 'quick_loan_now_247', displayName: 'Quick Loan 24x7',
    bio: 'Instant loans, no documents', createdDaysAgo: 14, followers: 40, following: 2200, posts: 5, logoHash: far(19),
    recentPosts: ['Instant loan! Pay ₹500 processing fee and share your Aadhaar on WhatsApp 9000011111 urgently'],
    label: 'borderline', // a scam, but not impersonating our brand
  }),
  ...[
    ['acc-22', 'travel_with_arjun', 'Arjun | Travel', 'Chasing sunsets across India', 900, 12000, 800, 450],
    ['acc-23', 'cricket_daily_in', 'Cricket Daily', 'Scores, stats and banter', 2000, 88000, 20, 9000],
    ['acc-24', 'techreview_hyd', 'Tech Review HYD', 'Phones and laptops, reviewed in Hyderabad', 1300, 24000, 300, 700],
    ['acc-25', 'home_chef_meera', 'Meera | Home Chef', 'Weeknight recipes for busy people', 600, 5400, 420, 310],
    ['acc-26', 'student_notes_hub', 'Student Notes Hub', 'Free study notes for engineering students', 400, 9100, 150, 260],
    ['acc-27', 'fitness_with_kabir', 'Kabir Fitness', 'Home workouts. No equipment.', 500, 7200, 200, 340],
    ['acc-28', 'bookworm_nisha', 'Nisha Reads', 'Reviews of Indian fiction', 800, 3100, 600, 520],
  ].map(([id, handle, displayName, bio, createdDaysAgo, followers, following, posts], i) =>
    account({
      id, platform: i % 2 ? 'instagram' : 'x', handle, displayName, bio, createdDaysAgo, followers, following, posts,
      logoHash: far(30 + i), recentPosts: ['Posted a new update today. Thanks for the support!'], label: 'legit',
    })
  ),
];

const app = (o) => ({ type: 'app', platform: 'android', description: '', truthCampaign: null, ...o });
const BASE_PERMS = ['INTERNET', 'ACCESS_FINE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'];

export const apps = [
  app({
    id: 'app-01', name: 'FreshKart', packageName: 'com.freshkart.app', developer: 'FreshKart Technologies Pvt Ltd',
    store: 'Google Play', certSha256: OFFICIAL_CERT, iconHash: LOGO, permissions: BASE_PERMS, downloads: 5000000,
    description: 'Order groceries in 30 minutes.', label: 'legit',
  }),
  app({
    id: 'app-02', name: 'FreshKart Delivery Partner', packageName: 'com.freshkart.partner', developer: 'FreshKart Technologies Pvt Ltd',
    store: 'Google Play', certSha256: OFFICIAL_CERT, iconHash: flip(LOGO, 8, 20), permissions: BASE_PERMS, downloads: 200000,
    description: 'For FreshKart delivery partners.', label: 'legit',
  }),
  app({
    id: 'app-03', name: 'FreshKart Refund Helper', packageName: 'com.freshkart.refundhelper', developer: 'FK Refund Services',
    store: 'direct-download', downloadUrl: APK, certSha256: 'DE:AD:BE:EF:00:11:22:33:44:55:66:77:88:99:AA:BB', iconHash: flip(LOGO, 3, 21),
    permissions: ['INTERNET', 'READ_SMS', 'RECEIVE_SMS', 'BIND_ACCESSIBILITY_SERVICE', 'SYSTEM_ALERT_WINDOW'], downloads: 0,
    fileSha256: 'sha-refund-helper-9f31', description: 'Get your failed-order refund instantly. Enter your UPI PIN to receive money.',
    label: 'fake', truthCampaign: 'A',
  }),
  app({
    id: 'app-04', name: 'FreshKart Wallet KYC', packageName: 'com.fresh.kart.wallet', developer: 'Fresh Kart Wallet',
    store: 'telegram', downloadUrl: 'https://t.me/freshkart_kyc_update/12', certSha256: '0B:AD:F0:0D:00:00:00:00:00:00:00:00:00:00:00:01',
    iconHash: flip(LOGO, 5, 22), permissions: ['INTERNET', 'READ_SMS', 'READ_CONTACTS', 'REQUEST_INSTALL_PACKAGES'], downloads: 0,
    fileSha256: 'sha-wallet-kyc-77c0', description: 'Complete wallet KYC. Support: 9876543210, pay fee to freshkart.kyc@okaxis',
    label: 'fake', truthCampaign: 'B',
  }),
  app({
    id: 'app-05', name: 'FreshKart Pro MOD (Free Delivery)', packageName: 'com.freshkart.app.mod', developer: 'Unknown',
    store: 'third-party-store', downloadUrl: 'https://apkdl-store.in/freshkart-pro-mod.apk', certSha256: '',
    iconHash: flip(LOGO, 2, 23), permissions: ['INTERNET', 'BIND_DEVICE_ADMIN', 'READ_CALL_LOG', 'RECORD_AUDIO'], downloads: 0,
    fileSha256: 'sha-pro-mod-1a2b', description: 'Cracked FreshKart with free delivery forever.', label: 'fake',
  }),
  app({
    id: 'app-06', name: 'FreshKart Cashback Rewards', packageName: 'com.fk.cashback', developer: 'Rewards Studio',
    store: 'Google Play', certSha256: '77:12:AA:09:3C:00:00:00:00:00:00:00:00:00:00:02', iconHash: flip(LOGO, 4, 24),
    permissions: ['INTERNET', 'SYSTEM_ALERT_WINDOW', 'READ_SMS'], downloads: 300,
    description: 'Earn cashback on every FreshKart order! Share OTP to verify.', label: 'fake',
  }),
  app({
    id: 'app-07', name: 'Fresh Cart - Grocery List', packageName: 'com.freshcart.lists', developer: 'Notely Apps',
    store: 'Google Play', certSha256: '12:34:56:78:9A:BC:DE:F0:11:22:33:44:55:66:77:88', iconHash: far(25),
    permissions: ['INTERNET'], downloads: 120000, description: 'A simple shopping-list notebook.', label: 'legit',
  }),
  app({
    id: 'app-08', name: 'FreshBasket', packageName: 'com.freshbasket.app', developer: 'FreshBasket Pvt Ltd',
    store: 'Google Play', certSha256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99', iconHash: far(26),
    permissions: ['INTERNET', 'ACCESS_FINE_LOCATION', 'CAMERA'], downloads: 800000, description: 'Online grocery store.', label: 'legit',
  }),
  app({
    id: 'app-09', name: 'BigGrocer', packageName: 'in.biggrocer.shop', developer: 'BigGrocer Retail',
    store: 'Google Play', certSha256: '99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA', iconHash: far(27),
    permissions: ['INTERNET', 'ACCESS_FINE_LOCATION'], downloads: 2000000, description: 'Supermarket delivery.', label: 'legit',
  }),
];

export const entities = [...accounts, ...apps];
