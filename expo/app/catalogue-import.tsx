import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  FileSpreadsheet,
  FileText,
  FileUp,
  Info,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  Trash2,
  Truck,
  X,
} from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useSupabaseInventoryStore, CatalogueImportResult } from '@/store/supabaseInventoryStore';
import { SupabaseService } from '@/services/supabaseService';
import {
  autoMapColumns,
  base64ToBytes,
  bucketOf,
  buildDraft,
  buildDrafts,
  buildImportAccounting,
  CatalogueSource,
  ColumnMapping,
  columnHints,
  countReview,
  deselectAll,
  detectHeaderRow,
  detectSource,
  DraftOverrides,
  DraftReference,
  emptySelection,
  excludeRows,
  FIELD_LABEL,
  ImportAccounting,
  parseCatalogueFile,
  ParsedCatalogueFile,
  PdfLimitationError,
  restoreRows,
  ReviewBucket,
  ReviewCategory,
  reviewDrafts,
  ReviewedDraft,
  ReviewSelection,
  selectAllReady,
  selectAllRemaining,
  selectedForImport,
  sheetToTable,
  sourceRowCount,
  stepBefore,
  supplierStockColumns,
  TARGET_FIELDS,
  TargetField,
  toggleSelected,
  withDefaultSelection,
} from '@/services/catalogueImportService';
import { formatUnitPrice, unitPriceLabel } from '@/utils/purchasing';

type Step = 'supplier' | 'file' | 'columns' | 'review' | 'done';
const STEPS: { key: Step; label: string }[] = [
  { key: 'supplier', label: 'Supplier' },
  { key: 'file', label: 'File' },
  { key: 'columns', label: 'Columns' },
  { key: 'review', label: 'Review' },
];
const FILE_COLUMN = '__file__';

type Filter = 'all' | 'selected' | ReviewBucket;

const FILTER_EXPLAIN: Record<Filter, string> = {
  all: 'Every product found in the file, except rows you removed.',
  selected: 'These are added when you tap Import.',
  ready: 'Complete rows that can be imported as they are.',
  review: 'Can be imported, but something needs a quick check — tap a row to see why. Not ticked automatically.',
  existing: 'Already in your catalogue, repeated in this file, or clashing with an existing product. Never imported — existing products are never changed.',
  cannot: 'Not products (freight, charges, totals) or missing a product name. These can’t be imported.',
  excluded: 'Rows you removed with the bin. Nothing is deleted — restore them any time.',
};

/** Quote / reference details for a row, in plain words (never saved). */
function referenceSummary(ref: DraftReference): string {
  const parts: string[] = [];
  if (ref.customerCode) parts.push(`Your code ${ref.customerCode}`);
  if (ref.quotedQuantity !== undefined) parts.push(`Quoted ${ref.quotedQuantity.toLocaleString()}`);
  if (ref.discountPercent) parts.push(`${ref.discountPercent}% off ${ref.listPrice !== undefined ? formatUnitPrice(ref.listPrice) : 'list'}`);
  if (ref.lineTotal !== undefined) parts.push(`Line total ${formatUnitPrice(ref.lineTotal)}`);
  if (ref.supplierStock !== undefined) parts.push(`Supplier has ${ref.supplierStock.toLocaleString()}`);
  return parts.join('  ·  ');
}

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
};

async function readFileBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return base64ToBytes(b64);
}

const EDIT_FIELDS: { field: TargetField; label: string; keyboard?: 'decimal-pad' | 'number-pad'; placeholder: string }[] = [
  { field: 'name', label: 'Product name', placeholder: 'Required' },
  { field: 'supplierCode', label: 'Supplier code', placeholder: 'e.g. FS-8G50' },
  { field: 'barcode', label: 'Barcode', placeholder: 'Optional' },
  { field: 'orderUnit', label: 'Order unit', placeholder: 'e.g. box of 1,000' },
  { field: 'unitsPerOrderUnit', label: 'Pack quantity', keyboard: 'decimal-pad', placeholder: 'Stock units per order unit' },
  { field: 'stockUnit', label: 'Stock unit', placeholder: 'each' },
  { field: 'purchasePrice', label: 'Purchase price (ex GST)', keyboard: 'decimal-pad', placeholder: 'e.g. 12.50' },
  { field: 'priceBasisQuantity', label: 'Price per', placeholder: 'e.g. 1, 100, per 1000, LM' },
  { field: 'category', label: 'Category', placeholder: 'Uncategorized' },
];

export default function CatalogueImportScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ supplierId?: string }>();
  const { colors, theme } = useThemeStore();
  const dark = theme === 'dark';
  const {
    products,
    business,
    businessLoaded,
    supplierRecords,
    supplierRecordsLoading,
    loadBusiness,
    loadSupplierRecords,
    importCatalogueProducts,
  } = useSupabaseInventoryStore();

  const [step, setStep] = useState<Step>(params.supplierId ? 'file' : 'supplier');
  const [supplierChoice, setSupplierChoice] = useState<string | null>(params.supplierId ?? null);
  const [file, setFile] = useState<ParsedCatalogueFile | null>(null);
  const [fileError, setFileError] = useState<{ title: string; message: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [pickerColumn, setPickerColumn] = useState<number | null>(null);
  // User edits per row (survive column changes) and the review selection.
  const [overrides, setOverrides] = useState<DraftOverrides>({});
  const [selection, setSelection] = useState<ReviewSelection>(emptySelection);
  const seenKeys = useRef<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<ReviewedDraft | null>(null);
  const [editValues, setEditValues] = useState<Partial<Record<TargetField, string>>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CatalogueImportResult | null>(null);
  const [accounting, setAccounting] = useState<ImportAccounting | null>(null);
  const [hadQuoteDetails, setHadQuoteDetails] = useState(false);
  const [purchasingColumns, setPurchasingColumns] = useState<boolean | null>(null);
  const allowLeave = useRef(false);
  /** Set when the user chooses to leave the whole workflow (Close), not step back. */
  const closing = useRef(false);
  const firstStep: Step = params.supplierId ? 'file' : 'supplier';

  // ---- data loading --------------------------------------------------------
  useEffect(() => {
    if (!businessLoaded) loadBusiness();
    else if (business) loadSupplierRecords();
  }, [businessLoaded, business, loadBusiness, loadSupplierRecords]);

  useEffect(() => {
    SupabaseService.hasPurchasingColumns().then(setPurchasingColumns).catch(() => setPurchasingColumns(false));
  }, []);

  const supplierRecord = useMemo(
    () => supplierRecords.find(s => s.id === supplierChoice),
    [supplierRecords, supplierChoice],
  );
  // A supplier link that no longer resolves falls back to supplier selection.
  useEffect(() => {
    if (!params.supplierId || supplierRecordsLoading || supplierRecords.length === 0) return;
    if (!supplierRecords.some(s => s.id === params.supplierId) && supplierChoice === params.supplierId) {
      setSupplierChoice(null);
      setStep('supplier');
    }
  }, [params.supplierId, supplierRecords, supplierRecordsLoading, supplierChoice]);

  const supplierCtx = useMemo(
    () => (supplierRecord ? { name: supplierRecord.name, email: supplierRecord.email || undefined, id: supplierRecord.id } : {}),
    [supplierRecord],
  );

  // Back (header arrow, Android back, swipe) moves one stage back and keeps
  // everything. Only leaving the workflow entirely asks before discarding.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (allowLeave.current || step === 'done') return;
      const type = (e.data.action as { type?: string } | undefined)?.type;
      const isBack = type === 'GO_BACK' || type === 'POP';
      if (isBack && !closing.current && step !== firstStep) {
        const prev = stepBefore(step);
        if (prev) {
          e.preventDefault();
          tap();
          setStep(prev);
          return;
        }
      }
      closing.current = false;
      if (!file) return;
      e.preventDefault();
      Alert.alert('Discard this import?', 'Your column choices and edits will be lost. Nothing has been imported yet.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            allowLeave.current = true;
            navigation.dispatch(e.data.action as never);
          },
        },
      ]);
    });
    return unsub;
  }, [navigation, step, file, firstStep]);

  const closeWorkflow = () => {
    closing.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/products');
  };

  // ---- table + mapping -----------------------------------------------------
  const sheet = file?.sheets[sheetIndex];
  const table = useMemo(() => (sheet ? sheetToTable(sheet, headerRow) : null), [sheet, headerRow]);

  /** A different table (file, worksheet or heading row): row edits and choices no longer apply. */
  const resetMapping = useCallback(
    (sheetIdx: number, hdr: number, parsed: ParsedCatalogueFile) => {
      const s = parsed.sheets[sheetIdx];
      const t = sheetToTable(s, hdr);
      setMapping(autoMapColumns(t.headers, t.rows.slice(0, 30).map(r => r.cells), parsed.document.kind));
      setOverrides({});
      setSelection(emptySelection());
      seenKeys.current = new Set();
    },
    [],
  );

  const selectSheet = (idx: number) => {
    if (!file) return;
    tap();
    const hdr = detectHeaderRow(file.sheets[idx].rows);
    setSheetIndex(idx);
    setHeaderRow(hdr);
    resetMapping(idx, hdr, file);
  };

  const changeHeaderRow = (delta: number) => {
    if (!file || !sheet) return;
    const next = Math.max(0, Math.min(sheet.rows.length - 2, headerRow + delta));
    if (next === headerRow) return;
    tap();
    setHeaderRow(next);
    resetMapping(sheetIndex, next, file);
  };

  const assignField = (col: number, field: TargetField | null) => {
    tap();
    setMapping(prev => {
      const next = [...prev];
      if (field) {
        const other = next.indexOf(field);
        if (other >= 0) next[other] = null; // a field maps to one column
      }
      next[col] = field;
      return next;
    });
    setPickerColumn(null);
  };

  const stockWarnings = useMemo(
    () => (table ? supplierStockColumns(table.headers, mapping) : []),
    [table, mapping],
  );
  const nameMapped = mapping.includes('name');

  // ---- file picking --------------------------------------------------------
  const pickFile = async () => {
    setFileError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/pdf',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const source: CatalogueSource | null = detectSource(asset.name, asset.mimeType);
      if (!source) {
        setFileError({
          title: 'File type not supported',
          message: 'Choose a CSV, Excel (.xlsx) or PDF price list from your supplier.',
        });
        return;
      }
      setReading(true);
      const bytes = await readFileBytes(asset.uri);
      const parsed = await parseCatalogueFile(bytes, asset.name, source);
      // Prefer the sheet that looks most like a price list.
      let bestSheet = 0;
      let bestRows = -1;
      parsed.sheets.forEach((s, i) => {
        const t = sheetToTable(s, detectHeaderRow(s.rows));
        const m = autoMapColumns(t.headers, t.rows.slice(0, 30).map(r => r.cells), parsed.document.kind);
        const score = (m.includes('name') ? 1000 : 0) + m.filter(Boolean).length * 100 + Math.min(t.rows.length, 99);
        if (score > bestRows) { bestRows = score; bestSheet = i; }
      });
      const hdr = detectHeaderRow(parsed.sheets[bestSheet].rows);
      setFile(parsed);
      setSheetIndex(bestSheet);
      setHeaderRow(hdr);
      resetMapping(bestSheet, hdr, parsed);
      setStep('columns');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (err) {
      if (err instanceof PdfLimitationError) {
        setFileError({
          title:
            err.kind === 'no-text'
              ? 'This PDF is a scanned image'
              : err.kind === 'encrypted'
                ? 'This PDF is locked'
                : 'This PDF could not be read reliably',
          message: `${err.message}\n\nNothing has been imported. Ask the supplier for their price list as an Excel or CSV file — it imports exactly.`,
        });
      } else {
        setFileError({
          title: 'Could not read this file',
          message: err instanceof Error ? err.message : 'The file could not be opened.',
        });
      }
    } finally {
      setReading(false);
    }
  };

  // ---- drafts + review -----------------------------------------------------
  const draftCtx = useMemo(
    () => (file ? { source: file.source, supplier: supplierCtx } : null),
    [file, supplierCtx],
  );
  const hints = useMemo(() => (table ? columnHints(table.headers, mapping) : undefined), [table, mapping]);

  const buildReviewed = useCallback(
    (ov: DraftOverrides) =>
      table && draftCtx ? reviewDrafts(products, buildDrafts(table, mapping, { ...draftCtx, hints }, sheet, ov)) : [],
    [table, draftCtx, products, mapping, hints, sheet],
  );

  const goToReview = () => {
    if (!table || !file) return;
    const rows = buildReviewed(overrides);
    // Rows seen before keep the user's choices; new rows get the default (Ready ticked).
    setSelection(prev => withDefaultSelection(rows, prev, seenKeys.current));
    rows.forEach(r => seenKeys.current.add(r.key));
    setFilter('all');
    setStep('review');
    tap();
  };

  const reviewed = useMemo(
    () => (step === 'review' ? buildReviewed(overrides) : []),
    [step, buildReviewed, overrides],
  );
  const counts = useMemo(() => countReview(reviewed, selection, sourceRowCount(sheet)), [reviewed, selection, sheet]);
  const selectedRows = useMemo(() => selectedForImport(reviewed, selection), [reviewed, selection]);
  const visibleRows = useMemo(() => {
    switch (filter) {
      case 'all': return reviewed.filter(r => !selection.excluded.has(r.key));
      case 'selected': return selectedRows;
      default: return reviewed.filter(r => bucketOf(r, selection) === filter);
    }
  }, [reviewed, filter, selection, selectedRows]);

  const basisQuestionRows = useMemo(
    () =>
      reviewed.filter(
        r =>
          r.importable &&
          !selection.excluded.has(r.key) &&
          !r.values.priceBasisQuantity &&
          r.issues.some(i => i.code === 'ambiguous-basis') &&
          (r.product.unitsPerOrderUnit ?? 1) > 1,
      ),
    [reviewed, selection],
  );

  const toggleRow = (row: ReviewedDraft) => {
    if (!row.importable || selection.excluded.has(row.key)) return;
    tap();
    setSelection(prev => toggleSelected(prev, row.key));
  };

  const excludeRow = (row: ReviewedDraft) => {
    tap();
    setSelection(prev => excludeRows(prev, [row.key]));
  };

  const restoreRow = (row: ReviewedDraft) => {
    tap();
    setSelection(prev => restoreRows(prev, [row.key]));
  };

  const applyBasisToAll = (perPack: boolean) => {
    tap();
    const next = { ...overrides };
    basisQuestionRows.forEach(r => {
      next[r.key] = { ...r.values, priceBasisQuantity: perPack ? String(r.product.unitsPerOrderUnit ?? 1) : '1' };
    });
    setOverrides(next);
    setSelection(prev => {
      const selected = new Set(prev.selected);
      basisQuestionRows.forEach(r => {
        const others = r.issues.filter(i => i.level === 'review' && i.code !== 'ambiguous-basis');
        if (others.length === 0) selected.add(r.key);
      });
      return { selected, excluded: prev.excluded };
    });
  };

  const bulk = (action: 'ready' | 'remaining' | 'none' | 'restore-all') => {
    tap();
    setSelection(prev => {
      switch (action) {
        case 'ready': return selectAllReady(reviewed, prev);
        case 'remaining': return selectAllRemaining(reviewed, prev);
        case 'none': return deselectAll(prev);
        default: return restoreRows(prev, [...prev.excluded]);
      }
    });
  };

  const openEdit = (row: ReviewedDraft) => {
    tap();
    setEditing(row);
    setEditValues({ ...row.values });
  };

  const saveEdit = () => {
    if (!editing || !file) return;
    const key = editing.key;
    const nextOverrides = { ...overrides, [key]: editValues };
    setOverrides(nextOverrides);
    const after = buildReviewed(nextOverrides).find(r => r.key === key);
    setSelection(prev => {
      const selected = new Set(prev.selected);
      if (after?.importable && after.status !== 'invalid' && !prev.excluded.has(key)) selected.add(key);
      else selected.delete(key);
      return { selected, excluded: prev.excluded };
    });
    setEditing(null);
  };

  const runImport = async () => {
    if (selectedRows.length === 0) return;
    // Snapshot the review state BEFORE saving: afterwards the new products
    // match themselves and would be miscounted as "already in catalogue".
    const rowsBefore = reviewed;
    const selBefore = selection;
    const sourceRows = sourceRowCount(sheet);
    const toSave = selectedRows;
    setImporting(true);
    try {
      const res = await importCatalogueProducts(toSave.map(r => r.product));
      setAccounting(
        buildImportAccounting(rowsBefore, selBefore, sourceRows, {
          imported: res.imported.length,
          skippedAsExisting: res.skippedAsExisting,
          failed: res.failed,
        }),
      );
      setHadQuoteDetails(toSave.some(r => referenceSummary(r.reference) !== ''));
      setResult(res);
      allowLeave.current = true;
      setStep('done');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          res.error ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      }
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Products could not be saved. Nothing was changed.');
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = () => {
    const n = selectedRows.length;
    const notTicked = counts.ready + counts.review - n;
    const left = [
      counts.existing > 0 ? `${counts.existing} already in your catalogue or repeated` : '',
      counts.excluded > 0 ? `${counts.excluded} removed by you` : '',
      counts.cannotImport > 0 ? `${counts.cannotImport} that can’t be imported` : '',
      notTicked > 0 ? `${notTicked} not ticked` : '',
    ].filter(Boolean);
    Alert.alert(
      `Import ${n} product${n === 1 ? '' : 's'}?`,
      `${n} new product${n === 1 ? '' : 's'} will be added${supplierRecord ? ` for ${supplierRecord.name}` : ''}.` +
        (left.length ? ` Not imported: ${left.join(', ')}.` : '') +
        ' Existing products and stock levels are never changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: runImport },
      ],
    );
  };

  const restart = () => {
    setFile(null);
    setOverrides({});
    setSelection(emptySelection());
    seenKeys.current = new Set();
    setResult(null);
    setAccounting(null);
    setFileError(null);
    allowLeave.current = false;
    setStep('file');
  };

  // ---- rendering helpers ---------------------------------------------------
  const tint = (hex: string, alpha: number) => {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `${hex}${a}`;
  };
  const surface = dark ? '#1A1D22' : '#FFFFFF';
  const canvas = dark ? '#0E1013' : '#F2F4F7';
  const statusColor: Record<ReviewCategory, string> = {
    ready: colors.success,
    existing: colors.inactive,
    conflict: colors.error,
    review: colors.warning,
    invalid: colors.error,
  };
  const statusLabel: Record<ReviewCategory, string> = {
    ready: 'Ready',
    existing: 'Already in catalogue',
    conflict: 'Conflict',
    review: 'Needs review',
    invalid: 'Cannot import',
  };

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const renderStepper = () =>
    step === 'done' ? null : (
      <View style={[styles.stepper, { backgroundColor: surface, borderBottomColor: colors.border }]}>
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && <View style={[styles.stepLine, { backgroundColor: i <= stepIndex ? colors.primary : colors.border }]} />}
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: done || active ? colors.primary : 'transparent',
                      borderColor: done || active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {done ? (
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  ) : (
                    <Text style={[styles.stepNum, { color: active ? '#FFFFFF' : colors.inactive }]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, { color: active ? colors.text : colors.inactive, fontWeight: active ? '700' : '500' }]}>
                  {s.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    );

  const Banner = ({ tone, title, children }: { tone: 'warn' | 'info' | 'error'; title?: string; children: React.ReactNode }) => {
    const c = tone === 'warn' ? colors.warning : tone === 'error' ? colors.error : colors.primary;
    const Icon = tone === 'info' ? Info : AlertTriangle;
    return (
      <View style={[styles.banner, { backgroundColor: tint(c, dark ? 0.16 : 0.1), borderColor: tint(c, 0.35) }]}>
        <Icon size={18} color={c} style={styles.bannerIcon} />
        <View style={styles.flex1}>
          {!!title && <Text style={[styles.bannerTitle, { color: colors.text }]}>{title}</Text>}
          <Text style={[styles.bannerText, { color: colors.text }]}>{children}</Text>
        </View>
      </View>
    );
  };

  const BottomBar = ({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: { label: string; onPress: () => void } }) => (
    <View style={[styles.bottomBar, { backgroundColor: surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {secondary && (
        <Pressable onPress={secondary.onPress} style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{secondary.label}</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: disabled ? colors.border : colors.primary, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] },
        ]}
      >
        <Text style={[styles.primaryBtnText, { color: disabled ? colors.inactive : '#FFFFFF' }]}>{label}</Text>
      </Pressable>
    </View>
  );

  // ---- step: supplier ------------------------------------------------------
  const renderSupplierStep = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollPad}>
        <Text style={[styles.h1, { color: colors.text }]}>Whose catalogue is this?</Text>
        <Text style={[styles.lead, { color: colors.inactive }]}>
          Imported products are linked to this supplier, so orders go to the right email automatically.
        </Text>

        {supplierRecordsLoading && supplierRecords.length === 0 && (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        )}

        {supplierRecords.map(s => {
          const active = supplierChoice === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => { tap(); setSupplierChoice(s.id); }}
              style={({ pressed }) => [
                styles.choiceCard,
                { backgroundColor: surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: tint(colors.primary, 0.12) }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{s.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.choiceTitle, { color: colors.text }]}>{s.name}</Text>
                <Text style={[styles.choiceSub, { color: colors.inactive }]} numberOfLines={1}>
                  {s.email || 'No ordering email yet'}
                </Text>
              </View>
              <View style={[styles.radio, { borderColor: active ? colors.primary : colors.border }]}>
                {active && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
              </View>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => { tap(); setSupplierChoice(FILE_COLUMN); }}
          style={({ pressed }) => [
            styles.choiceCard,
            { backgroundColor: surface, borderColor: supplierChoice === FILE_COLUMN ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: tint(colors.inactive, 0.15) }]}>
            <FileSpreadsheet size={18} color={colors.inactive} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.choiceTitle, { color: colors.text }]}>Supplier is a column in my file</Text>
            <Text style={[styles.choiceSub, { color: colors.inactive }]}>For files that mix several suppliers</Text>
          </View>
          <View style={[styles.radio, { borderColor: supplierChoice === FILE_COLUMN ? colors.primary : colors.border }]}>
            {supplierChoice === FILE_COLUMN && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
          </View>
        </Pressable>

        <Pressable onPress={() => router.push('/suppliers')} style={styles.linkRow}>
          <Truck size={16} color={colors.primary} />
          <Text style={[styles.linkText, { color: colors.primary }]}>
            {supplierRecords.length === 0 ? 'Add your first supplier' : 'Add or edit suppliers'}
          </Text>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      </ScrollView>
      <BottomBar label="Continue" disabled={!supplierChoice} onPress={() => { tap(); setStep('file'); }} />
    </>
  );

  // ---- step: file ----------------------------------------------------------
  const renderFileStep = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollPad}>
        <Text style={[styles.h1, { color: colors.text }]}>Add the supplier’s price list</Text>
        <Text style={[styles.lead, { color: colors.inactive }]}>
          {supplierRecord ? `Importing for ${supplierRecord.name}. ` : ''}
          Use the file exactly as the supplier sent it — you’ll match the columns next.
        </Text>

        <Pressable
          onPress={pickFile}
          disabled={reading}
          style={({ pressed }) => [
            styles.dropZone,
            { borderColor: tint(colors.primary, 0.5), backgroundColor: tint(colors.primary, dark ? 0.1 : 0.05), transform: [{ scale: pressed ? 0.99 : 1 }] },
          ]}
        >
          {reading ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.dropTitle, { color: colors.text }]}>Reading file…</Text>
            </>
          ) : (
            <>
              <View style={[styles.dropIcon, { backgroundColor: colors.primary }]}>
                <FileUp size={28} color="#FFFFFF" />
              </View>
              <Text style={[styles.dropTitle, { color: colors.text }]}>{file ? 'Choose a different file' : 'Choose a file'}</Text>
              <View style={styles.formatRow}>
                {['CSV', 'Excel', 'PDF'].map(f => (
                  <View key={f} style={[styles.formatChip, { backgroundColor: surface, borderColor: colors.border }]}>
                    <Text style={[styles.formatChipText, { color: colors.text }]}>{f}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Pressable>

        {fileError && <Banner tone="error" title={fileError.title}>{fileError.message}</Banner>}

        {file && !reading && (
          <View style={[styles.fileChip, { backgroundColor: surface, borderColor: tint(colors.primary, 0.45) }]}>
            {file.source === 'pdf' ? <FileText size={18} color={colors.primary} /> : <FileSpreadsheet size={18} color={colors.primary} />}
            <View style={styles.flex1}>
              <Text style={[styles.fileChipName, { color: colors.text }]} numberOfLines={1}>{file.fileName}</Text>
              <Text style={[styles.fileChipMeta, { color: colors.inactive }]} numberOfLines={1}>
                {file.document.label} · your column choices and edits are kept
              </Text>
            </View>
            <Check size={18} color={colors.success} />
          </View>
        )}

        <View style={[styles.tipCard, { backgroundColor: surface, borderColor: colors.border }]}>
          <View style={styles.tipRow}>
            <FileSpreadsheet size={18} color={colors.success} />
            <Text style={[styles.tipText, { color: colors.text }]}>
              <Text style={styles.bold}>Excel and CSV</Text> import exactly, including files with title rows and several worksheets.
            </Text>
          </View>
          <View style={styles.tipRow}>
            <FileText size={18} color={colors.warning} />
            <Text style={[styles.tipText, { color: colors.text }]}>
              <Text style={styles.bold}>PDF</Text> price lists work when they contain real text in a table. Scanned PDFs can’t be read — SmartStock never guesses values.
            </Text>
          </View>
        </View>
      </ScrollView>
      {file ? (
        <BottomBar
          label="Continue"
          onPress={() => { tap(); setStep('columns'); }}
          secondary={params.supplierId ? undefined : { label: 'Back', onPress: () => { tap(); setStep('supplier'); } }}
        />
      ) : (
        !params.supplierId && <BottomBar label="Back" onPress={() => { tap(); setStep('supplier'); }} />
      )}
    </>
  );

  // ---- step: columns -------------------------------------------------------
  const renderColumnsStep = () => {
    if (!file || !sheet || !table) return null;
    const sample = table.rows.slice(0, 3);
    return (
      <>
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <View style={[styles.fileChip, { backgroundColor: surface, borderColor: colors.border }]}>
            {file.source === 'pdf' ? <FileText size={18} color={colors.primary} /> : <FileSpreadsheet size={18} color={colors.primary} />}
            <Text style={[styles.fileChipName, { color: colors.text }]} numberOfLines={1}>{file.fileName}</Text>
            <Text style={[styles.fileChipMeta, { color: colors.inactive }]}>{table.rows.length} rows</Text>
            <Pressable onPress={() => { tap(); setStep('file'); }} hitSlop={8}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Change</Text>
            </Pressable>
          </View>

          {file.sheets.length > 1 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.inactive }]}>WORKSHEET</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {file.sheets.map((s, i) => (
                  <Pressable
                    key={`${s.name}-${i}`}
                    onPress={() => selectSheet(i)}
                    style={[styles.chip, { backgroundColor: i === sheetIndex ? colors.primary : surface, borderColor: i === sheetIndex ? colors.primary : colors.border }]}
                  >
                    <Text style={[styles.chipText, { color: i === sheetIndex ? '#FFFFFF' : colors.text }]}>{s.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          <Banner tone="info" title={file.document.label}>{file.document.explanation}</Banner>
          {file.notes.map(n => <Banner key={n} tone="info">{n}</Banner>)}

          <Text style={[styles.sectionLabel, { color: colors.inactive }]}>COLUMN HEADINGS</Text>
          <View style={[styles.headerRowCard, { backgroundColor: surface, borderColor: colors.border }]}>
            <View style={styles.flex1}>
              <Text style={[styles.choiceTitle, { color: colors.text }]}>Headings are on row {headerRow + 1}</Text>
              <Text style={[styles.choiceSub, { color: colors.inactive }]} numberOfLines={1}>
                {(sheet.rows[headerRow] ?? []).filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
            <Pressable onPress={() => changeHeaderRow(-1)} style={[styles.stepBtn, { borderColor: colors.border }]} hitSlop={6}>
              <Minus size={16} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => changeHeaderRow(1)} style={[styles.stepBtn, { borderColor: colors.border }]} hitSlop={6}>
              <Plus size={16} color={colors.text} />
            </Pressable>
          </View>

          {stockWarnings.length > 0 && (
            <Banner tone="warn" title="Supplier stock levels are not imported">
              {`"${stockWarnings.join('", "')}" looks like the supplier’s own stock. It is left out so it can never be mistaken for the stock on your shelves.`}
            </Banner>
          )}
          {!nameMapped && (
            <Banner tone="error" title="Choose the product name column">
              Tap the column that holds the product name or description and set it to “Product name”.
            </Banner>
          )}
          {supplierRecord && mapping.some(f => f === 'supplier' || f === 'supplierEmail') && (
            <Banner tone="info">{`Supplier columns in the file are ignored — every product is linked to ${supplierRecord.name}.`}</Banner>
          )}

          <Text style={[styles.sectionLabel, { color: colors.inactive }]}>MATCH COLUMNS</Text>
          {table.headers.map((h, col) => {
            const field = mapping[col];
            const samples = sample.map(r => r.cells[col]).filter(Boolean).slice(0, 3);
            return (
              <Pressable
                key={`${h}-${col}`}
                onPress={() => { tap(); setPickerColumn(col); }}
                style={({ pressed }) => [styles.mapCard, { backgroundColor: surface, borderColor: field ? tint(colors.primary, 0.35) : colors.border, opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.flex1}>
                  <Text style={[styles.mapHeader, { color: colors.text }]} numberOfLines={1}>{h}</Text>
                  <Text style={[styles.mapSample, { color: colors.inactive }]} numberOfLines={1}>
                    {samples.length ? samples.join('  ·  ') : 'empty'}
                  </Text>
                </View>
                <View style={[styles.fieldPill, { backgroundColor: field ? tint(colors.primary, 0.12) : tint(colors.inactive, 0.12) }]}>
                  <Text style={[styles.fieldPillText, { color: field ? colors.primary : colors.inactive }]} numberOfLines={1}>
                    {field ? FIELD_LABEL[field] : 'Not imported'}
                  </Text>
                  <ChevronDown size={14} color={field ? colors.primary : colors.inactive} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <BottomBar label="Review products" disabled={!nameMapped} onPress={goToReview} secondary={{ label: 'Back', onPress: () => { tap(); setStep('file'); } }} />
      </>
    );
  };

  // ---- step: review --------------------------------------------------------
  const filters: { key: Filter; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'All', count: counts.productRows - counts.excluded, color: colors.text },
    { key: 'selected', label: 'Selected', count: counts.selected, color: colors.primary },
    { key: 'ready', label: 'Ready', count: counts.ready, color: colors.success },
    { key: 'review', label: 'Needs review', count: counts.review, color: colors.warning },
    { key: 'existing', label: 'Existing / duplicate', count: counts.existing, color: colors.inactive },
    { key: 'cannot', label: 'Cannot import', count: counts.cannotImport, color: colors.error },
    { key: 'excluded', label: 'Removed', count: counts.excluded, color: colors.inactive },
  ];

  const renderRow = ({ item }: { item: ReviewedDraft }) => {
    const excluded = selection.excluded.has(item.key);
    const canSelect = item.importable && !excluded;
    const isSel = canSelect && selection.selected.has(item.key);
    const p = item.product;
    const mainIssue =
      item.category === 'existing' || item.category === 'conflict'
        ? item.match.reason
        : item.issues.find(i => i.level === 'error') ?? item.issues.find(i => i.level === 'review') ?? item.issues.find(i => i.level === 'info');
    const issueText = typeof mainIssue === 'string' ? mainIssue : mainIssue?.message;
    const price = p.purchasePrice !== undefined ? unitPriceLabel(p) : 'No price';
    const meta = [p.supplierCode, p.orderUnit, price].filter(Boolean).join('  ·  ');
    const ref = referenceSummary(item.reference);
    const c = excluded ? colors.inactive : statusColor[item.category];
    const label = excluded ? 'Removed by you' : statusLabel[item.category];
    return (
      <Pressable
        onPress={() => openEdit(item)}
        style={({ pressed }) => [
          styles.rowCard,
          {
            backgroundColor: surface,
            borderColor: isSel ? tint(colors.primary, 0.45) : colors.border,
            opacity: pressed ? 0.88 : canSelect ? 1 : 0.72,
          },
        ]}
      >
        <Pressable
          onPress={() => toggleRow(item)}
          hitSlop={10}
          disabled={!canSelect}
          style={styles.checkWrap}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSel, disabled: !canSelect }}
        >
          {canSelect ? (
            <View style={[styles.checkbox, { borderColor: isSel ? colors.primary : colors.border, backgroundColor: isSel ? colors.primary : 'transparent' }]}>
              {isSel && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
            </View>
          ) : (
            <CircleSlash size={20} color={colors.inactive} />
          )}
        </Pressable>
        <View style={styles.flex1}>
          <Text style={[styles.rowName, { color: p.name ? colors.text : colors.inactive }]} numberOfLines={2}>
            {p.name || `Row ${item.rowNumber} — no name`}
          </Text>
          {!!meta && <Text style={[styles.rowMeta, { color: colors.inactive }]} numberOfLines={1}>{meta}</Text>}
          {!!ref && <Text style={[styles.rowRef, { color: colors.inactive }]} numberOfLines={1}>{ref}</Text>}
          <View style={styles.rowFooter}>
            <View style={[styles.statusBadge, { backgroundColor: tint(c, 0.14) }]}>
              <View style={[styles.statusDot, { backgroundColor: c }]} />
              <Text style={[styles.statusText, { color: c }]}>{label}</Text>
            </View>
            {item.edited && <Text style={[styles.rowNum, { color: colors.primary }]}>Edited</Text>}
            <Text style={[styles.rowNum, { color: colors.inactive }]}>Row {item.rowNumber}</Text>
          </View>
          {!!issueText && !excluded && (
            <Text style={[styles.rowIssue, { color: colors.text }]} numberOfLines={2}>{issueText}</Text>
          )}
        </View>
        <Pressable
          onPress={() => (excluded ? restoreRow(item) : excludeRow(item))}
          hitSlop={10}
          style={({ pressed }) => [styles.binBtn, { backgroundColor: pressed ? tint(excluded ? colors.primary : colors.error, 0.12) : 'transparent' }]}
          accessibilityLabel={excluded ? 'Restore row' : 'Remove row from this import'}
        >
          {excluded ? <RotateCcw size={18} color={colors.primary} /> : <Trash2 size={18} color={colors.inactive} />}
        </Pressable>
      </Pressable>
    );
  };

  const renderReviewHeader = () => {
    const nonProductLines = counts.sourceRows - counts.productRows;
    const remaining = counts.ready + counts.review;
    return (
      <View>
        <View style={[styles.summaryHero, { backgroundColor: colors.primary }]}>
          <Text style={styles.summaryBig}>{counts.selected}</Text>
          <View style={styles.flex1}>
            <Text style={styles.summaryTitle}>new product{counts.selected === 1 ? '' : 's'} selected</Text>
            <Text style={styles.summarySub}>
              {counts.productRows} products found in {counts.sourceRows} lines{supplierRecord ? ` · ${supplierRecord.name}` : ''}
            </Text>
          </View>
          <PackageCheck size={30} color="rgba(255,255,255,0.85)" />
        </View>

        {file && (
          <Text style={[styles.docLine, { color: colors.inactive }]}>
            <Text style={[styles.bold, { color: colors.text }]}>{file.document.label}. </Text>
            {nonProductLines > 0 ? `${nonProductLines} line${nonProductLines === 1 ? ' was a heading, page header, note or total' : 's were headings, page headers, notes or totals'} and are not products. ` : ''}
            {file.document.explanation}
          </Text>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {filters.filter(f => f.key === 'all' || f.key === filter || f.count > 0).map(f => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => { tap(); setFilter(f.key); }}
                style={[styles.filterChip, { backgroundColor: active ? colors.text : surface, borderColor: active ? colors.text : colors.border }]}
              >
                <Text style={[styles.chipText, { color: active ? (dark ? '#000' : '#FFF') : colors.text }]}>{f.label}</Text>
                <View style={[styles.countBubble, { backgroundColor: active ? (dark ? '#0003' : '#FFF3') : tint(f.color, 0.15) }]}>
                  <Text style={[styles.countText, { color: active ? (dark ? '#000' : '#FFF') : f.color }]}>{f.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[styles.filterExplain, { color: colors.inactive }]}>{FILTER_EXPLAIN[filter]}</Text>

        {purchasingColumns === false && (
          <Banner tone="info" title="Purchasing details saved on this device for now">
            Supplier codes, order units, pack quantities and price bases are kept on this phone until your database upgrade (Chapter 3) is installed, then saved to your account automatically. Names, categories, suppliers and costs save to your account now.
          </Banner>
        )}

        {basisQuestionRows.length > 0 && (
          <View style={[styles.questionCard, { backgroundColor: surface, borderColor: tint(colors.warning, 0.5) }]}>
            <Text style={[styles.choiceTitle, { color: colors.text }]}>
              Is the price per item or per pack?
            </Text>
            <Text style={[styles.choiceSub, { color: colors.inactive, marginBottom: 12 }]}>
              {basisQuestionRows.length} row{basisQuestionRows.length === 1 ? '' : 's'} list a pack size but don’t say what the price covers. Choose for all of them, or tap a row to set it individually.
            </Text>
            <View style={styles.twoBtns}>
              <Pressable onPress={() => applyBasisToAll(false)} style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Per item</Text>
              </Pressable>
              <Pressable onPress={() => applyBasisToAll(true)} style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Per pack</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.bulkRow}>
          {filter === 'excluded' ? (
            counts.excluded > 0 && (
              <Pressable onPress={() => bulk('restore-all')} hitSlop={6}>
                <Text style={[styles.linkText, { color: colors.primary }]}>Restore all</Text>
              </Pressable>
            )
          ) : (
            <>
              <Pressable onPress={() => bulk('ready')} hitSlop={6} disabled={counts.ready === 0}>
                <Text style={[styles.linkText, { color: counts.ready === 0 ? colors.inactive : colors.primary }]}>Select all ready</Text>
              </Pressable>
              {counts.review > 0 && (
                <Pressable onPress={() => bulk('remaining')} hitSlop={6}>
                  <Text style={[styles.linkText, { color: colors.primary }]}>Select all remaining ({remaining})</Text>
                </Pressable>
              )}
              <Pressable onPress={() => bulk('none')} hitSlop={6} disabled={counts.selected === 0}>
                <Text style={[styles.linkText, { color: colors.inactive }]}>Deselect all</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderReviewStep = () => (
    <>
      <FlatList
        data={visibleRows}
        keyExtractor={r => r.key}
        renderItem={renderRow}
        ListHeaderComponent={renderReviewHeader}
        contentContainerStyle={styles.listPad}
        initialNumToRender={20}
        windowSize={10}
        ListEmptyComponent={<Text style={[styles.lead, { color: colors.inactive, textAlign: 'center', marginTop: 24 }]}>No rows in this view.</Text>}
      />
      <BottomBar
        label={importing ? 'Importing…' : selectedRows.length === 0 ? 'Select products to import' : `Import ${selectedRows.length} product${selectedRows.length === 1 ? '' : 's'}`}
        disabled={importing || selectedRows.length === 0}
        onPress={confirmImport}
        secondary={{ label: 'Back', onPress: () => { tap(); setStep('columns'); } }}
      />
    </>
  );

  // ---- step: done ----------------------------------------------------------
  const renderDoneStep = () => {
    if (!result || !accounting) return null;
    const a = accounting;
    const n = a.imported;
    const ok = !result.error && a.saveFailed === 0 && a.notAttempted === 0;
    const lines: { label: string; value: number; color: string; always?: boolean }[] = [
      { label: 'Added to your catalogue', value: n, color: colors.success, always: true },
      { label: 'Already in catalogue when saving — skipped', value: a.existingAtSave, color: colors.inactive },
      { label: 'Not saved — error', value: a.saveFailed, color: colors.error },
      { label: 'Not saved — import stopped early', value: a.notAttempted, color: colors.error },
      { label: 'Already in catalogue or repeated — skipped', value: a.existingSkipped, color: colors.inactive },
      { label: 'Removed by you', value: a.userExcluded, color: colors.inactive },
      { label: 'Cannot import (charges, totals, no name)', value: a.cannotImport, color: colors.warning },
      { label: 'Not ticked', value: a.notSelected, color: colors.inactive },
    ];
    return (
      <>
        <ScrollView contentContainerStyle={[styles.scrollPad, styles.doneWrap]}>
          <View style={[styles.doneIcon, { backgroundColor: tint(ok ? colors.success : colors.warning, 0.15) }]}>
            {ok ? <CheckCircle2 size={44} color={colors.success} /> : <AlertTriangle size={44} color={colors.warning} />}
          </View>
          <Text style={[styles.h1, styles.center, { color: colors.text }]}>
            {n > 0 ? `${n} product${n === 1 ? '' : 's'} added` : 'No products added'}
          </Text>
          <Text style={[styles.lead, styles.center, { color: colors.inactive }]}>
            {supplierRecord && n > 0 ? `Linked to ${supplierRecord.name}. ` : ''}Existing products and stock levels were not changed.
          </Text>

          <View style={[styles.resultCard, { backgroundColor: surface, borderColor: colors.border }]}>
            {lines.filter(l => l.always || l.value > 0).map(l => (
              <ResultLine key={l.label} label={l.label} value={l.value} color={l.color} textColor={colors.text} />
            ))}
            <View style={[styles.resultTotal, { borderTopColor: colors.border }]}>
              <Text style={[styles.resultTotalText, { color: colors.inactive }]}>
                {a.productRows} product{a.productRows === 1 ? '' : 's'} found in {a.sourceRows} line{a.sourceRows === 1 ? '' : 's'} · each counted once
              </Text>
            </View>
          </View>

          {result.error && (
            <Banner tone="error" title="Some products could not be saved">
              {`${result.error}\n\nRun the import again with the same file — products already added will show as “Already in catalogue”, so nothing is duplicated.`}
            </Banner>
          )}
          {n > 0 && purchasingColumns !== false && (
            <Banner tone="info" title="Saved to your account">
              Names, categories, supplier links, supplier codes, order units, pack quantities and prices.
            </Banner>
          )}
          {result.purchasingHeldOnDevice > 0 && (
            <Banner tone="info" title="Purchasing details held on this device">
              {`Names, categories, suppliers and costs were saved to your account. ${result.purchasingHeldOnDevice} product${result.purchasingHeldOnDevice === 1 ? ' has' : 's have'} supplier codes, pack sizes or price bases waiting for the database upgrade — used for ordering on this phone now and saved to your account automatically once the upgrade is installed.`}
            </Banner>
          )}
          {hadQuoteDetails && n > 0 && (
            <Banner tone="info">
              Quote details (quoted quantities, line totals, discounts and supplier stock) were used only to check prices and are not saved.
            </Banner>
          )}
        </ScrollView>
        <BottomBar
          label="View products"
          onPress={() => { allowLeave.current = true; router.replace('/(tabs)/products'); }}
          secondary={{ label: 'Import another', onPress: restart }}
        />
      </>
    );
  };

  // ---- modals --------------------------------------------------------------
  const renderFieldPicker = () => (
    <Modal visible={pickerColumn !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerColumn(null)} transparent={Platform.OS === 'web'}>
      <View style={[styles.modalRoot, { backgroundColor: canvas }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: surface }]}>
          <View style={styles.flex1}>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
              {pickerColumn !== null && table ? `“${table.headers[pickerColumn]}”` : ''}
            </Text>
            <Text style={[styles.choiceSub, { color: colors.inactive }]}>What does this column contain?</Text>
          </View>
          <Pressable onPress={() => setPickerColumn(null)} hitSlop={10}>
            <X size={22} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <Pressable
            onPress={() => pickerColumn !== null && assignField(pickerColumn, null)}
            style={[styles.fieldOption, { backgroundColor: surface, borderColor: pickerColumn !== null && mapping[pickerColumn] === null ? colors.primary : colors.border }]}
          >
            <Text style={[styles.choiceTitle, { color: colors.text }]}>Don’t import</Text>
            <Text style={[styles.choiceSub, { color: colors.inactive }]}>Leave this column out</Text>
          </Pressable>
          {TARGET_FIELDS.map(f => {
            const current = pickerColumn !== null && mapping[pickerColumn] === f.field;
            const usedBy = mapping.indexOf(f.field);
            const usedElsewhere = usedBy >= 0 && usedBy !== pickerColumn && table;
            const disabledBySupplier = !!supplierRecord && (f.field === 'supplier' || f.field === 'supplierEmail');
            return (
              <Pressable
                key={f.field}
                disabled={disabledBySupplier}
                onPress={() => pickerColumn !== null && assignField(pickerColumn, f.field)}
                style={[styles.fieldOption, { backgroundColor: surface, borderColor: current ? colors.primary : colors.border, opacity: disabledBySupplier ? 0.45 : 1 }]}
              >
                <View style={styles.fieldOptionRow}>
                  <Text style={[styles.choiceTitle, styles.flex1, { color: colors.text }]}>{f.label}</Text>
                  {current && <Check size={18} color={colors.primary} />}
                </View>
                <Text style={[styles.choiceSub, { color: f.field === 'currentStock' ? colors.warning : colors.inactive }]}>
                  {disabledBySupplier ? 'Set by the supplier you chose' : f.hint}
                  {usedElsewhere && table ? `  ·  now: “${table.headers[usedBy]}”` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderEditModal = () => {
    if (!editing) return null;
    const preview = file
      ? buildDraft(editing.key, editing.rowNumber, editValues, { source: file.source, supplier: supplierCtx, hints, lowConfidence: false })
      : null;
    const ref = referenceSummary((preview ?? editing).reference);
    const matchNote = editing.category === 'existing' || editing.category === 'conflict' ? editing.match.reason : null;
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)} transparent={Platform.OS === 'web'}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalRoot, { backgroundColor: canvas }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: surface }]}>
            <Pressable onPress={() => setEditing(null)} hitSlop={10}>
              <Text style={[styles.linkText, { color: colors.inactive }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, styles.flex1, styles.center, { color: colors.text }]}>Row {editing.rowNumber}</Text>
            <Pressable onPress={saveEdit} hitSlop={10}>
              <Text style={[styles.linkText, { color: colors.primary, fontWeight: '700' }]}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            {matchNote && <Banner tone={editing.category === 'conflict' ? 'error' : 'info'}>{matchNote}</Banner>}
            {!!ref && (
              <Banner tone="info" title="From the document (not saved)">{ref}</Banner>
            )}
            {preview?.issues.filter(i => i.level !== 'info' || i.code === 'missing-price').map(i => (
              <Banner key={i.code + i.message} tone={i.level === 'error' ? 'error' : i.level === 'review' ? 'warn' : 'info'}>{i.message}</Banner>
            ))}
            {EDIT_FIELDS.map(f => (
              <View key={f.field} style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inactive }]}>{f.label.toUpperCase()}</Text>
                <TextInput
                  value={editValues[f.field] ?? ''}
                  onChangeText={t => setEditValues(v => ({ ...v, [f.field]: t }))}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.inactive}
                  keyboardType={f.keyboard ?? 'default'}
                  autoCapitalize={f.field === 'name' || f.field === 'category' ? 'sentences' : 'none'}
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: surface, borderColor: colors.border, color: colors.text }]}
                />
              </View>
            ))}
            {preview && preview.product.purchasePrice !== undefined && (
              <Text style={[styles.choiceSub, { color: colors.inactive, marginTop: 4 }]}>
                Will order as: {preview.product.orderUnit || 'each'}  ·  {unitPriceLabel(preview.product)}
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  return (
    <View style={[styles.flex1, { backgroundColor: canvas }]}>
      <Stack.Screen
        options={{
          title: step === 'done' ? 'Import Complete' : 'Import Catalogue',
          // Swiping would leave the workflow; Back steps through the stages instead.
          gestureEnabled: step === 'done' || (step === firstStep && !file),
          headerRight:
            step === 'done'
              ? undefined
              : () => (
                  <Pressable onPress={closeWorkflow} hitSlop={10} accessibilityLabel="Close import">
                    <X size={22} color={colors.text} />
                  </Pressable>
                ),
        }}
      />
      {renderStepper()}
      {step === 'supplier' && renderSupplierStep()}
      {step === 'file' && renderFileStep()}
      {step === 'columns' && renderColumnsStep()}
      {step === 'review' && renderReviewStep()}
      {step === 'done' && renderDoneStep()}
      {renderFieldPicker()}
      {renderEditModal()}
    </View>
  );
}

function ResultLine({ label, value, color, textColor }: { label: string; value: number; color: string; textColor: string }) {
  return (
    <View style={styles.resultLine}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.resultLabel, { color: textColor }]}>{label}</Text>
      <Text style={[styles.resultValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 11, fontWeight: '700' },
  stepLabel: { fontSize: 11 },
  stepLine: { flex: 1, height: 2, marginHorizontal: 6, marginBottom: 16, borderRadius: 1 },
  scrollPad: { padding: 20, paddingBottom: 40 },
  listPad: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  lead: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  choiceTitle: { fontSize: 16, fontWeight: '600' },
  choiceSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontWeight: '600' },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 17, fontWeight: '700' },
  secondaryBtn: { height: 52, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 16, fontWeight: '600' },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dropIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontSize: 18, fontWeight: '700' },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  formatChipText: { fontSize: 13, fontWeight: '600' },
  tipCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  tipRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20 },
  banner: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, gap: 10 },
  bannerIcon: { marginTop: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  bannerText: { fontSize: 13.5, lineHeight: 19 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  fileChipName: { flex: 1, fontSize: 15, fontWeight: '600' },
  fileChipMeta: { fontSize: 13 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 8 },
  chipRow: { gap: 8, paddingBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
  headerRowCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginBottom: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 },
  mapHeader: { fontSize: 15, fontWeight: '700' },
  mapSample: { fontSize: 13, marginTop: 2 },
  fieldPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, maxWidth: 170 },
  fieldPillText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  summaryHero: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 18, marginBottom: 14, gap: 14 },
  summaryBig: { fontSize: 44, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  summarySub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  countBubble: { minWidth: 24, paddingHorizontal: 6, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '800' },
  questionCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 12 },
  twoBtns: { flexDirection: 'row', gap: 10 },
  outlineBtn: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { fontSize: 15, fontWeight: '700' },
  bulkRow: { flexDirection: 'row', gap: 18, marginBottom: 10, marginTop: 2, flexWrap: 'wrap' },
  rowCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, gap: 12 },
  checkWrap: { paddingTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15.5, fontWeight: '600', lineHeight: 20 },
  rowMeta: { fontSize: 13, marginTop: 3 },
  rowRef: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  binBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: -4, marginTop: -4 },
  docLine: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  filterExplain: { fontSize: 12.5, lineHeight: 17, marginBottom: 10, marginTop: -4 },
  resultTotal: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  resultTotalText: { fontSize: 13 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  rowNum: { fontSize: 12 },
  rowIssue: { fontSize: 13, marginTop: 6, lineHeight: 18, opacity: 0.85 },
  doneWrap: { alignItems: 'stretch', paddingTop: 40 },
  doneIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 18 },
  resultCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  resultLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  resultLabel: { flex: 1, fontSize: 15 },
  resultValue: { fontSize: 17, fontWeight: '800' },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  fieldOption: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 8 },
  fieldOptionRow: { flexDirection: 'row', alignItems: 'center' },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
});
