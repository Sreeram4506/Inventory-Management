import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { BusinessExpense } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useExpenses() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const response = await apiFetch('/expenses', token);
      return handleApiResponse<BusinessExpense[]>(response, logout);
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const addExpenseMutation = useMutation({
    mutationFn: async (newExpense: Partial<BusinessExpense>) => {
      const response = await apiFetch('/expenses', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newExpense),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  return {
    expenses: expensesQuery.data || [],
    isLoading: expensesQuery.isLoading,
    isError: expensesQuery.isError,
    error: expensesQuery.error,
    addExpense: addExpenseMutation.mutateAsync,
  };
}
