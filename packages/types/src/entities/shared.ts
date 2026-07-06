import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime({ offset: true });

export const BaseEntitySchema = z.object({
  id: UuidSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: TimestampSchema.nullable().optional(),
});
export type BaseEntity = z.infer<typeof BaseEntitySchema>;

export const CursorSchema = z.string().base64();

export const DivisionIdSchema = UuidSchema;
export const BannerIdSchema = UuidSchema;
export const StoreIdSchema = UuidSchema;
export const CustomerIdSchema = UuidSchema;
export const ProductIdSchema = UuidSchema;
export const UserIdSchema = UuidSchema;
export const CampaignIdSchema = UuidSchema;

// Upstream reference entities (read-only projections in CampaignOS)
export const ProductSchema = z.object({
  id: ProductIdSchema,
  sku: z.string(),
  name: z.string(),
  categoryId: UuidSchema,
  brandId: UuidSchema.nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "DISCONTINUED"]),
});
export type Product = z.infer<typeof ProductSchema>;

export const StoreSchema = z.object({
  id: StoreIdSchema,
  name: z.string(),
  bannerId: BannerIdSchema,
  divisionId: DivisionIdSchema,
  zipCode: z.string(),
  status: z.enum(["ACTIVE", "CLOSED"]),
});
export type Store = z.infer<typeof StoreSchema>;

export const BannerSchema = z.object({
  id: BannerIdSchema,
  name: z.string(),
  divisionId: DivisionIdSchema,
});
export type Banner = z.infer<typeof BannerSchema>;

export const DivisionSchema = z.object({
  id: DivisionIdSchema,
  name: z.string(),
});
export type Division = z.infer<typeof DivisionSchema>;

export const CategorySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  parentId: UuidSchema.nullable(),
  level: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof CategorySchema>;
