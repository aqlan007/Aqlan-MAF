/**
 * Perhitungan Harga Pokok Penjualan (HPP) & Margin Keuntungan
 * Sesuai prinsip akuntansi retail POS:
 * Total Biaya = Harga Beli Total + Biaya Tambahan + Biaya Transport + Biaya Lainnya
 * HPP per unit = Total Biaya / Jumlah Unit
 * Keuntungan per unit = Harga Jual - HPP
 * Margin % = ((Harga Jual - HPP) / Harga Jual) * 100
 */

export interface HppCalculationInput {
  purchaseAmount: number; // Harga total beli barang
  quantity: number; // Jumlah unit
  transportCost?: number; // Biaya transportasi/ongkir
  additionalCost?: number; // Biaya handling/kemasan
  otherCost?: number; // Biaya lainnya
}

export interface HppCalculationResult {
  totalCost: number;
  quantity: number;
  hppPerUnit: number;
}

export function calculateHpp(input: HppCalculationInput): HppCalculationResult {
  const quantity = Math.max(1, input.quantity || 1);
  const purchaseAmount = Math.max(0, input.purchaseAmount || 0);
  const transportCost = Math.max(0, input.transportCost || 0);
  const additionalCost = Math.max(0, input.additionalCost || 0);
  const otherCost = Math.max(0, input.otherCost || 0);

  const totalCost = purchaseAmount + transportCost + additionalCost + otherCost;
  const hppPerUnit = Math.round(totalCost / quantity);

  return {
    totalCost,
    quantity,
    hppPerUnit,
  };
}

export function calculateProfitAndMargin(sellPrice: number, hpp: number): { profit: number; marginPercent: number } {
  const safeSellPrice = Math.max(0, sellPrice || 0);
  const safeHpp = Math.max(0, hpp || 0);
  const profit = safeSellPrice - safeHpp;
  const marginPercent = safeSellPrice > 0 ? ((safeSellPrice - safeHpp) / safeSellPrice) * 100 : 0;

  return {
    profit,
    marginPercent: Number(marginPercent.toFixed(1)),
  };
}

export function calculateSellPriceFromMargin(hpp: number, targetMarginPercent: number): number {
  if (targetMarginPercent >= 100) return hpp * 2;
  const marginDecimal = targetMarginPercent / 100;
  const price = hpp / (1 - marginDecimal);
  return Math.ceil(price / 100) * 100; // round up to nearest hundred
}

// ==========================================
// FORMULA HPP RESEP BAHAN BAKU F&B / CAFE
// ==========================================

/**
 * Hitung biaya per satuan resep (gram, ml, pcs) dengan memperhitungkan faktor susut/yield loss
 * Contoh: Biji Kopi Rp 190.000 / 1000g, susut 5% saat dial-in espresso
 * Biaya dasar = 190/g. Biaya efektif = 190 / (1 - 0.05) = Rp 200/g
 */
export function calculateEffectiveUnitCost(
  purchasePrice: number,
  conversionFactor: number,
  wastagePercent: number = 0
): number {
  const factor = Math.max(0.0001, conversionFactor || 1);
  const baseCost = purchasePrice / factor;
  const safeWastage = Math.min(90, Math.max(0, wastagePercent || 0));
  const effectiveCost = baseCost / (1 - safeWastage / 100);
  return Math.round(effectiveCost * 100) / 100; // preserve 2 decimals
}

export interface RecipeTotalCalculationInput {
  itemSubtotals: number[]; // array of subtotal for each recipe item
  packagingCost?: number; // cup, lid, straw, sleeve, box
  laborCost?: number; // per portion labor overhead
  utilityCost?: number; // gas, electricity, ice cube overhead
  otherCost?: number; // other variable costs
  targetFoodCostPercent?: number; // e.g. 30%
  actualSellPrice?: number;
}

export interface RecipeTotalCalculationResult {
  totalIngredientCost: number;
  packagingCost: number;
  laborCost: number;
  utilityCost: number;
  otherCost: number;
  totalHpp: number;
  recommendedPrice: number;
  actualSellPrice: number;
  actualFoodCostPercent: number;
  actualMarginPercent: number;
  actualProfit: number;
  foodCostStatus: {
    label: string;
    description: string;
    level: 'optimal' | 'moderate' | 'warning' | 'critical';
    color: string;
  };
}

/**
 * Hitung total HPP, Food Cost %, Margin %, dan Rekomendasi Harga Jual dari komponen Resep
 */
export function calculateRecipeTotals(input: RecipeTotalCalculationInput): RecipeTotalCalculationResult {
  const totalIngredientCost = Math.round(input.itemSubtotals.reduce((acc, curr) => acc + (curr || 0), 0));
  const packagingCost = Math.max(0, input.packagingCost || 0);
  const laborCost = Math.max(0, input.laborCost || 0);
  const utilityCost = Math.max(0, input.utilityCost || 0);
  const otherCost = Math.max(0, input.otherCost || 0);

  const totalHpp = totalIngredientCost + packagingCost + laborCost + utilityCost + otherCost;

  // Target Food Cost calculation (F&B industry standard: 28% - 35%)
  const targetFC = Math.min(90, Math.max(10, input.targetFoodCostPercent || 30));
  const rawRecommendedPrice = totalHpp / (targetFC / 100);
  // Round to nearest Rp 500 for clean F&B menu pricing
  const recommendedPrice = Math.ceil(rawRecommendedPrice / 500) * 500;

  const actualSellPrice = Math.max(0, input.actualSellPrice ?? recommendedPrice);
  const actualProfit = actualSellPrice - totalHpp;
  const actualFoodCostPercent = actualSellPrice > 0 ? (totalHpp / actualSellPrice) * 100 : 0;
  const actualMarginPercent = actualSellPrice > 0 ? ((actualSellPrice - totalHpp) / actualSellPrice) * 100 : 0;

  // Food Cost Health Rating
  let foodCostStatus: RecipeTotalCalculationResult['foodCostStatus'];
  if (actualFoodCostPercent <= 32) {
    foodCostStatus = {
      label: 'Sangat Sehat & Menguntungkan',
      description: 'Food cost di bawah 32%, margin laba sangat tebal untuk F&B.',
      level: 'optimal',
      color: 'emerald',
    };
  } else if (actualFoodCostPercent <= 38) {
    foodCostStatus = {
      label: 'Standar Ideal Cafe (32% - 38%)',
      description: 'Sesuai patokan sehat industri kuliner dan coffee shop modern.',
      level: 'moderate',
      color: 'blue',
    };
  } else if (actualFoodCostPercent <= 45) {
    foodCostStatus = {
      label: 'Margin Menipis (38% - 45%)',
      description: 'HPP cukup tinggi. Pertimbangkan menaikkan harga atau negosiasi bahan baku.',
      level: 'warning',
      color: 'amber',
    };
  } else {
    foodCostStatus = {
      label: 'Waspada! Food Cost Terlalu Tinggi (>45%)',
      description: 'Potensi merugi setelah dipotong sewa tempat dan beban operasional.',
      level: 'critical',
      color: 'rose',
    };
  }

  return {
    totalIngredientCost,
    packagingCost,
    laborCost,
    utilityCost,
    otherCost,
    totalHpp,
    recommendedPrice,
    actualSellPrice,
    actualFoodCostPercent: Number(actualFoodCostPercent.toFixed(1)),
    actualMarginPercent: Number(actualMarginPercent.toFixed(1)),
    actualProfit,
    foodCostStatus,
  };
}
