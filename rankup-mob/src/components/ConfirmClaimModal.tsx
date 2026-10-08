import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getCategoryIcon } from '../constants/icons';
import { Radius, Spacing } from '../constants/theme';
import { useClaimModal } from '../context/ModalContext';
import { useAppTheme } from '../context/ThemeContext';
import { CategoryDto, ListingLookupResultDto } from '../models';
import { calculateClaimQuote, fetchUrlMetadata, getCategories, lookupListing } from '../services/api';

export const ConfirmClaimModal: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const { modalPayload, closeClaimModal } = useClaimModal();

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number>(1);
  const [selectedCatName, setSelectedCatName] = useState<string>('General');
  const [selectedCatSlug, setSelectedCatSlug] = useState<string>('general');

  const [url, setUrl] = useState<string>('');
  const [listingName, setListingName] = useState<string>('');
  const [ownerEmail, setOwnerEmail] = useState<string>('');
  const [targetAmount, setTargetAmount] = useState<number>(10);
  const [minStartingClaim, setMinStartingClaim] = useState<number>(1);
  const [minIncrement, setMinIncrement] = useState<number>(1);

  const [activeListing, setActiveListing] = useState<ListingLookupResultDto | null>(null);
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [metadataLoading, setMetadataLoading] = useState<boolean>(false);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [agreedTerms, setAgreedTerms] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Success state
  const [transactionSuccess, setTransactionSuccess] = useState<boolean>(false);
  const [receiptDetails, setReceiptDetails] = useState<any>(null);

  useEffect(() => {
    getCategories().then((res) => {
      if (res && res.items) {
        setCategories(res.items);
      }
    });
  }, []);

  useEffect(() => {
    if (!modalPayload) {
      setTransactionSuccess(false);
      setReceiptDetails(null);
      return;
    }

    if (modalPayload.categoryId) {
      setSelectedCatId(modalPayload.categoryId);
    }
    if (modalPayload.categoryName) {
      setSelectedCatName(modalPayload.categoryName);
    }
    if (modalPayload.categorySlug) {
      setSelectedCatSlug(modalPayload.categorySlug);
    }

    const initAmount = modalPayload.amount || 10;
    setTargetAmount(initAmount);

    if (modalPayload.minStartingClaim) {
      setMinStartingClaim(modalPayload.minStartingClaim);
    }
    if (modalPayload.minClaimIncrement) {
      setMinIncrement(modalPayload.minClaimIncrement);
    }

    if (modalPayload.listingUrl) {
      setUrl(modalPayload.listingUrl);
      doLookup(modalPayload.categoryId || selectedCatId, modalPayload.listingUrl);
    } else {
      setUrl('');
      setActiveListing(null);
    }

    if (modalPayload.listingName) {
      setListingName(modalPayload.listingName);
    } else {
      setListingName('');
    }

    setAgreedTerms(true);
    setSubmitting(false);
    setStatusMessage(null);
    setTransactionSuccess(false);
    setReceiptDetails(null);
  }, [modalPayload]);

  const doLookup = async (catId: number, checkUrl: string) => {
    if (!checkUrl || checkUrl.trim().length < 3) return;
    setIsLookingUp(true);
    try {
      const res = await lookupListing(catId, checkUrl);
      setActiveListing(res && res.found ? res : null);
      if (res?.found && res.listingName && !listingName) {
        setListingName(res.listingName);
      }
    } catch {
      setActiveListing(null);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleUrlChange = async (val: string) => {
    setUrl(val);
    if (val.trim().length > 4 && val.includes('.')) {
      doLookup(selectedCatId, val);
      // Fetch metadata
      setMetadataLoading(true);
      try {
        const meta = await fetchUrlMetadata(val);
        if (meta) {
          if (meta.title && !listingName) setListingName(meta.title);
          if (meta.siteName) setSiteName(meta.siteName);
          if (meta.description) setDescription(meta.description);
          if (meta.logoUrl || meta.faviconUrl) setLogoUrl(meta.logoUrl || meta.faviconUrl);
        }
      } catch {
        // Ignore
      } finally {
        setMetadataLoading(false);
      }
    }
  };

  const existingClaim = activeListing?.currentClaimAmount ?? 0;
  const isReclaim = activeListing?.found && existingClaim > 0;
  const creditedAmount = isReclaim ? existingClaim : 0;
  const payableAmount = Math.max(0, targetAmount - creditedAmount);

  const incrementClaim = () => {
    setTargetAmount((prev) => prev + minIncrement);
  };

  const decrementClaim = () => {
    setTargetAmount((prev) => Math.max(minStartingClaim, prev - minIncrement));
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      setStatusMessage('Please enter your website URL or @handle.');
      return;
    }
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) {
      setStatusMessage('Please enter a valid owner contact email.');
      return;
    }
    if (targetAmount < minStartingClaim) {
      setStatusMessage(`Placement amount must be at least ₹${minStartingClaim}.`);
      return;
    }
    if (isReclaim && targetAmount <= existingClaim) {
      setStatusMessage(`Target placement must be higher than current placement of ₹${existingClaim}.`);
      return;
    }

    setSubmitting(true);
    setStatusMessage('Validating quote...');

    try {
      // 1. Calculate Quote
      const quote = await calculateClaimQuote({
        categoryId: selectedCatId,
        listingUrl: url.trim(),
        ownerContactEmail: ownerEmail.trim(),
        targetClaimAmount: targetAmount,
      });

      if (!quote.success) {
        setStatusMessage(quote.errorMessage || 'Quote validation failed.');
        setSubmitting(false);
        return;
      }

      // Mobile payment flow via Dodo Payments is not yet implemented.
      // Payments must be completed via the web app at https://rankup.so
      setStatusMessage('Mobile payments are coming soon. Please visit rankup.so to complete your claim.');
    } catch (err: any) {
      setStatusMessage(err?.message || 'Transaction could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!modalPayload) return null;

  return (
    <Modal
      visible={!!modalPayload}
      animationType="slide"
      transparent
      onRequestClose={closeClaimModal}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isReclaim ? colors.primaryLight : colors.secondaryLight,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isReclaim ? colors.primary : colors.secondaryGreen },
                    ]}>
                    {isReclaim ? '🔄 Raising Existing Position' : '🚀 Claim Position'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {transactionSuccess ? 'Payment Confirmed' : 'Confirm & Claim'}
              </Text>
            </View>

            <Pressable
              style={[styles.closeBtn, { backgroundColor: colors.surfaceSubtle }]}
              onPress={closeClaimModal}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {transactionSuccess && receiptDetails ? (
              /* Success Receipt View */
              <View style={styles.successContainer}>
                <View style={[styles.successIconCircle, { backgroundColor: colors.secondaryLight }]}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.secondaryGreen} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>
                  Payment & Placement Successful!
                </Text>
                <Text style={[styles.successSubtitle, { color: colors.textMuted }]}>
                  Your sponsored placement is confirmed and your ranking is now live on the{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {receiptDetails.categoryName}
                  </Text>{' '}
                  leaderboard.
                </Text>

                <View style={[styles.successAmountBox, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.successAmountVal, { color: colors.primary }]}>
                    ₹{receiptDetails.amountPaid?.toFixed(2)}
                  </Text>
                  <Text style={[styles.successAmountSub, { color: colors.textMuted }]}>
                    Amount Settled
                  </Text>
                </View>

                {/* Details Breakdown */}
                <View style={[styles.receiptCard, { borderColor: colors.border }]}>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                      Listing / Product
                    </Text>
                    <Text style={[styles.receiptVal, { color: colors.text }]}>
                      {receiptDetails.listingName}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Product URL</Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.receiptVal, { color: colors.text, maxWidth: 200 }]}>
                      {receiptDetails.listingUrl}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                      New Placement Level
                    </Text>
                    <Text
                      style={[
                        styles.receiptVal,
                        { color: colors.primary, fontWeight: '800' },
                      ]}>
                      ₹{receiptDetails.newClaimAmount?.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Category</Text>
                    <Text style={[styles.receiptVal, { color: colors.text }]}>
                      {receiptDetails.categoryName}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Ref ID</Text>
                    <Text style={[styles.receiptVal, { color: colors.textMuted, fontSize: 11 }]}>
                      {receiptDetails.paymentId}
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.four }]}
                  onPress={closeClaimModal}>
                  <Text style={styles.primaryBtnText}>View on Leaderboard 🚀</Text>
                </Pressable>
              </View>
            ) : (
              /* Claim Form */
              <View style={styles.formContainer}>
                {/* Summary Row */}
                <View style={[styles.summaryCard, { backgroundColor: colors.surfaceSubtle }]}>
                  <View style={styles.summaryCol}>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Category</Text>
                    <Text style={[styles.summaryVal, { color: colors.text }]}>
                      {getCategoryIcon(selectedCatSlug)} {selectedCatName}
                    </Text>
                  </View>
                  <View style={styles.summaryCol}>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Target Placement</Text>
                    <Text style={[styles.summaryVal, { color: colors.primary, fontWeight: '800' }]}>
                      ₹{targetAmount}
                    </Text>
                  </View>
                </View>

                {/* Website URL Input */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    Website Domain or @X Handle *
                  </Text>
                  <View
                    style={[
                      styles.textInputWrap,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
                    ]}>
                    <Ionicons name="link-outline" size={18} color={colors.textMuted} />
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder="https://yourapp.io or @maker"
                      placeholderTextColor={colors.textFaint}
                      value={url}
                      onChangeText={handleUrlChange}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {isLookingUp || metadataLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : null}
                  </View>
                </View>

                {/* Product Name Input */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Product Name</Text>
                  <View
                    style={[
                      styles.textInputWrap,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
                    ]}>
                    <Ionicons name="rocket-outline" size={18} color={colors.textMuted} />
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder="e.g. My Awesome App"
                      placeholderTextColor={colors.textFaint}
                      value={listingName}
                      onChangeText={setListingName}
                    />
                  </View>
                </View>

                {/* Re-claim Active Alert Banner */}
                {isReclaim && (
                  <View
                    style={[
                      styles.reclaimAlert,
                      { backgroundColor: colors.secondaryLight, borderColor: colors.secondaryGreen },
                    ]}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.secondaryGreen} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reclaimAlertTitle, { color: colors.secondaryGreen }]}>
                        Active Listing Found {activeListing?.currentRankInCategory ? `(Rank #${activeListing.currentRankInCategory})` : ''}
                      </Text>
                      <Text style={[styles.reclaimAlertDesc, { color: colors.text }]}>
                        Previous payment of{' '}
                        <Text style={{ fontWeight: '700' }}>₹{existingClaim.toFixed(2)}</Text> will be
                        credited 100% toward this placement.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Placement Stepper */}
                <View style={styles.inputGroup}>
                  <View style={styles.claimHeaderRow}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>Target Placement Amount</Text>
                    <Text style={[styles.minClaimLabel, { color: colors.textMuted }]}>
                      Min: ₹{minStartingClaim}
                    </Text>
                  </View>
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.surfaceSubtle }]}
                      onPress={decrementClaim}>
                      <Ionicons name="remove" size={20} color={colors.text} />
                    </Pressable>

                    <View
                      style={[
                        styles.stepperInputWrap,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
                      ]}>
                      <Text style={[styles.stepperCurrency, { color: colors.primary }]}>₹</Text>
                      <TextInput
                        style={[styles.stepperInput, { color: colors.text }]}
                        keyboardType="numeric"
                        value={String(targetAmount)}
                        onChangeText={(t) => {
                          const n = parseInt(t, 10);
                          setTargetAmount(isNaN(n) ? minStartingClaim : n);
                        }}
                      />
                    </View>

                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.surfaceSubtle }]}
                      onPress={incrementClaim}>
                      <Ionicons name="add" size={20} color={colors.text} />
                    </Pressable>
                  </View>
                </View>

                {/* Owner Email */}
                <View style={styles.inputGroup}>
                  <View style={styles.claimHeaderRow}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>Owner Contact Email *</Text>
                    {isReclaim && activeListing?.ownerContactEmailMasked && (
                      <Text style={[styles.registeredEmailPill, { color: colors.primary }]}>
                        Registered: {activeListing.ownerContactEmailMasked}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.textInputWrap,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
                    ]}>
                    <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder="founder@example.com"
                      placeholderTextColor={colors.textFaint}
                      value={ownerEmail}
                      onChangeText={setOwnerEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {isReclaim && (
                    <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                      Must match registered email to authorize your previous payment credit.
                    </Text>
                  )}
                </View>

                {/* Calculation Ledger */}
                <View style={[styles.ledgerCard, { borderColor: colors.border }]}>
                  <View style={styles.ledgerHeader}>
                    <Ionicons name="receipt-outline" size={15} color={colors.textMuted} />
                    <Text style={[styles.ledgerHeaderText, { color: colors.textMuted }]}>
                      PAYMENT BREAKDOWN
                    </Text>
                  </View>

                  <View style={styles.ledgerRow}>
                    <Text style={[styles.ledgerItemTitle, { color: colors.text }]}>Target Placement Amount</Text>
                    <Text style={[styles.ledgerItemVal, { color: colors.text }]}>₹{targetAmount.toFixed(2)}</Text>
                  </View>

                  {isReclaim && (
                    <View style={styles.ledgerRow}>
                      <Text style={[styles.ledgerItemTitle, { color: colors.success }]}>
                        Previous Payment Credited (100%)
                      </Text>
                      <Text style={[styles.ledgerItemVal, { color: colors.success }]}>
                        -₹{creditedAmount.toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.ledgerDivider, { backgroundColor: colors.border }]} />

                  <View style={styles.ledgerTotalRow}>
                    <View>
                      <Text style={[styles.ledgerTotalTitle, { color: colors.text }]}>
                        Net Amount Due
                      </Text>
                      <Text style={[styles.ledgerTotalDesc, { color: colors.textMuted }]}>
                        Instant Live Activation
                      </Text>
                    </View>
                    <Text style={[styles.ledgerTotalVal, { color: colors.primary }]}>
                      ₹{payableAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Gateway notice matching web */}
                <View style={[styles.gatewayNotice, { backgroundColor: colors.surfaceSubtle }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.gatewayNoticeText, { color: colors.textMuted }]}>
                    Payment gateway under review. Simulated instant test payments enabled for testing.
                  </Text>
                </View>

                {/* Status or error message */}
                {statusMessage && (
                  <View
                    style={[
                      styles.alertBox,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.warning },
                    ]}>
                    <Ionicons name="alert-circle" size={16} color={colors.warning} />
                    <Text style={[styles.alertText, { color: colors.text }]}>{statusMessage}</Text>
                  </View>
                )}

                {/* Terms agreement checkbox */}
                <Pressable
                  style={styles.termsRow}
                  onPress={() => setAgreedTerms(!agreedTerms)}>
                  <Ionicons
                    name={agreedTerms ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={agreedTerms ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.termsText, { color: colors.textMuted }]}>
                    I agree to the 100% transparent RankUp Rules & Terms of Service.
                  </Text>
                </Pressable>

                {/* Action buttons */}
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    onPress={closeClaimModal}>
                    <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.primaryBtn,
                      {
                        backgroundColor: colors.primary,
                        opacity: submitting ? 0.6 : 1,
                      },
                    ]}
                    disabled={submitting}
                    onPress={handleSubmit}>
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        Claim & Pay ₹{payableAmount.toFixed(2)}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '92%',
    paddingBottom: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  statusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingHorizontal: Spacing.three,
  },
  formContainer: {
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  summaryCol: {
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  summaryVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  claimHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  minClaimLabel: {
    fontSize: 12,
  },
  registeredEmailPill: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 34,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 12,
  },
  fieldHint: {
    fontSize: 10.5,
    marginTop: 2,
  },
  reclaimAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  reclaimAlertTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  reclaimAlertDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  stepperCurrency: {
    fontSize: 14,
    fontWeight: '800',
    marginRight: 4,
  },
  stepperInput: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 40,
  },
  ledgerCard: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.two,
  },
  ledgerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  ledgerHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerItemTitle: {
    fontSize: 13,
  },
  ledgerItemVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  ledgerDivider: {
    height: 1,
    marginVertical: 4,
  },
  ledgerTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerTotalTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  ledgerTotalDesc: {
    fontSize: 11,
  },
  ledgerTotalVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  gatewayNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.two,
    borderRadius: Radius.sm,
  },
  gatewayNoticeText: {
    fontSize: 11,
    flex: 1,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  alertText: {
    fontSize: 12,
    flex: 1,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  termsText: {
    fontSize: 11,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  cancelBtn: {
    flex: 1,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 2,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    gap: Spacing.two,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
    lineHeight: 18,
  },
  successAmountBox: {
    marginVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  successAmountVal: {
    fontSize: 26,
    fontWeight: '800',
  },
  successAmountSub: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  receiptCard: {
    width: '100%',
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: '600',
  },
});
