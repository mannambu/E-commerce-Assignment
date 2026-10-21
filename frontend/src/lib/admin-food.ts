import { csv } from './admin.ts';
export const goalLabels: Record<string, string> = { LoseFat: 'Giảm mỡ', GainMuscle: 'Tăng cơ', MaintainWeight: 'Duy trì' };
export type FoodItem = {
  _id: string; name: string; description: string; images: string[]; price: number; calories: number;
  nutrition: { protein: number; carb: number; fat: number; };
  ingredients: { name: string; allergyTags: string[]; }[];
  tags: string[]; goalTags?: string[]; stock: number; reservedStock?: number; isActive: boolean;
  availability?: { availableQuantity: number; }; rating?: number; reviewCount?: number;
};
export type FoodForm = {
  name: string; description: string; images: string; price: string; calories: string; stock: string;
  protein: string; carb: string; fat: string; tags: string; goalTags: string[];
  ingredients: { name: string; allergyTags: string; }[];
};
export function foodToForm(food?: FoodItem): FoodForm {
  return {
    name: food?.name || '', description: food?.description || '', images: food?.images.join('\n') || '',
    price: String(food?.price ?? ''), calories: String(food?.calories ?? ''), stock: String(food?.stock ?? ''),
    protein: String(food?.nutrition.protein ?? ''), carb: String(food?.nutrition.carb ?? ''), fat: String(food?.nutrition.fat ?? ''),
    tags: food?.tags.join(', ') || '', goalTags: [...(food?.goalTags || [])],
    ingredients: food?.ingredients.map(item => ({ name: item.name, allergyTags: item.allergyTags.join(', ') })) || [{ name: '', allergyTags: '' }]
  };
}
export function foodPayload(form: FoodForm, reservedStock = 0) {
  if (!form.name.trim() || !form.description.trim()) throw new Error('Tên món và mô tả không được để trống.');
  const numeric = ['price', 'calories', 'stock', 'protein', 'carb', 'fat'] as const;
  if (numeric.some(key => !form[key].trim() || !Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) throw new Error('Giá, calo, tồn kho và dinh dưỡng phải là số không âm.');
  if (Number(form.price) <= 0) throw new Error('Giá phải lớn hơn 0.');
  if (!Number.isSafeInteger(Number(form.stock))) throw new Error('Tồn kho phải là số nguyên không âm.');
  if (Number(form.stock) < reservedStock) throw new Error(`Tồn kho tổng không được thấp hơn ${reservedStock} phần đang giữ cho đơn chờ.`);
  const images = form.images.split('\n').map(value => value.trim()).filter(Boolean);
  if (!images.length) throw new Error('Cần ít nhất một ảnh món ăn.');
  if (!form.ingredients.length || form.ingredients.some(item => !item.name.trim())) throw new Error('Cần nhập tên cho từng nguyên liệu.');
  return {
    name: form.name.trim(), description: form.description.trim(), images,
    price: Number(form.price), calories: Number(form.calories), stock: Number(form.stock),
    nutrition: { protein: Number(form.protein), carb: Number(form.carb), fat: Number(form.fat) },
    ingredients: form.ingredients.map(item => ({ name: item.name.trim(), allergyTags: csv(item.allergyTags) })),
    tags: csv(form.tags), goalTags: form.goalTags
  };
}
