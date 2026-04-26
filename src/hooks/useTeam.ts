import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: {
    vehiclesAdded: number;
    salesMade: number;
  };
  vehiclesAdded: any[];
  salesMade: any[];
}

export function useTeam() {
  const { user, token, logout } = useAuth();

  const teamQuery = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const response = await apiFetch('/team', token);
      return handleApiResponse<TeamMember[]>(response, logout);
    },
    enabled: !!token && user?.role === 'ADMIN',
    staleTime: 60000,
  });

  return {
    team: teamQuery.data || [],
    isLoading: teamQuery.isLoading,
    isError: teamQuery.isError,
  };
}
