import { z } from "zod";

export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  hasMore: z.boolean(),
  totalCount: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });
}

export type PaginatedResponse<T> = {
  data: T[];
  pagination: Pagination;
};

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
