// The brand being protected. In a real deployment an analyst fills this in once during onboarding.
// FreshKart is a fictional grocery-delivery brand used for the demo.

export const OFFICIAL_LOGO_HASH = 'e3c1a5b7d9f20486';
export const OFFICIAL_CERT = '4F:A1:9C:07:2B:E8:51:D3:6A:90:BC:14:7E:F2:33:08';

export const brand = {
  name: 'FreshKart',
  tagline: 'Groceries delivered in 30 minutes',
  token: 'freshkart',
  officialHandles: ['freshkart_in', 'freshkart_care'],
  officialDisplayNames: ['FreshKart', 'FreshKart Care'],
  officialDomains: ['freshkart.in', 'www.freshkart.in', 'help.freshkart.in'],
  officialPhones: ['18001234567'],
  logoHash: OFFICIAL_LOGO_HASH,
  officialApp: {
    package: 'com.freshkart.app',
    name: 'FreshKart',
    developer: 'FreshKart Technologies Pvt Ltd',
    certSha256: OFFICIAL_CERT,
    iconHash: OFFICIAL_LOGO_HASH,
    store: 'Google Play',
    // Permissions the real app legitimately needs.
    permissions: ['INTERNET', 'ACCESS_FINE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'],
  },
};
