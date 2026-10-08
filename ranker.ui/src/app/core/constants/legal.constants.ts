/**
 * Centralized Legal & Compliance Configuration
 * Mandated for Payment Gateway merchant verification and live status.
 */
export interface LegalConfig {
  /** Legal Name as per PAN Card */
  legalName: string;
  /** Mandatory statement: "This website is operated by [legalName]" */
  operatedByText: string;
  /** Brand / Trading Name */
  brandName: string;
  /** Registered Address (as per Aadhaar Card) */
  registeredAddress: string;
  /** Customer Support & Billing Email */
  supportEmail: string;
  /** Official Website URL */
  websiteUrl: string;
  /** Operating Currency */
  currency: string;
  /** Currency Symbol */
  currencySymbol: string;
  /** Service / Shipping Delivery Duration */
  shippingDuration: string;
  /** Platform launch date */
  estDate: string;
}

export const LEGAL_CONFIG: LegalConfig = {
  legalName: 'Shekhar',
  operatedByText: 'This website is operated by Shekhar',
  brandName: 'RankUp',
  registeredAddress: 'Bhagwanpur, District - Muzaffarpur, Bihar, PIN: 842001, India',
  supportEmail: 'shekhar3355@hotmail.com',
  websiteUrl: 'https://rankup.cyou',
  currency: 'USD',
  currencySymbol: '$',
  shippingDuration: 'Instantaneous (within 0 to 15 minutes of payment confirmation)',
  estDate: 'September 2026',
};
