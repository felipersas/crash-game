export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export function computePagination(input: PaginationInput = {}): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, input.page || 1);
  const limit = Math.min(100, Math.max(1, input.limit || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
