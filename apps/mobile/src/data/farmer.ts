import { currentVets } from '@wechiau/shared';
import { useMemo } from 'react';
import { useSignedIn } from '@/auth/session';
import { useFarmers, useUsers, useVetAssignments } from './hooks';

/**
 * The farmer app's own farm and vet. The phone holds only this farmer's rows,
 * and among the staff only their own vet (permissions map: own_farm).
 */
export function useMyFarm() {
  const { user: me } = useSignedIn();
  const farmerId = me.farmer_id ?? '';
  const farmers = useFarmers();
  const users = useUsers();
  const assignments = useVetAssignments();
  return useMemo(() => {
    const vetId = currentVets(assignments).get(farmerId) ?? null;
    return {
      me,
      farmerId,
      farmer: farmers.find((f) => f.id === farmerId) ?? null,
      vet: users.find((u) => u.id === vetId) ?? null,
    };
  }, [me, farmerId, farmers, users, assignments]);
}
