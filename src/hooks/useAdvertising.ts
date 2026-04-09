import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { AdvertisingExpense } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useAdvertising() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const adsQuery = useQuery({
    queryKey: ['advertising'],
    queryFn: async () => {
      const response = await apiFetch('/advertising', token);
      return handleApiResponse<AdvertisingExpense[]>(response, logout);
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const addAdMutation = useMutation({
    mutationFn: async (newAd: Partial<AdvertisingExpense>) => {
      const response = await apiFetch('/advertising', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAd),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising'] });
    },
  });

  return {
    ads: adsQuery.data || [],
    isLoading: adsQuery.isLoading,
    isError: adsQuery.isError,
    error: adsQuery.error,
    addAd: addAdMutation.mutateAsync,
  };
}
