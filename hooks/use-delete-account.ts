import { useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/use-auth';

/**
 * Permanent account deletion (LGPD Art. 18, VI). Calls the server mutation that
 * purges every server-side record, then wipes whatever local state the caller
 * owns, clears the session and sends the user back to login. Shared by the
 * monitored and caregiver settings screens so the irreversible flow stays
 * identical; each screen passes its own `clearLocalData` (the two trees use
 * different local contexts).
 *
 * Returns `runDeleteAccount` (call after the user confirms) and `isDeleting`.
 */
export function useDeleteAccount(clearLocalData?: () => void | Promise<void>) {
  const deleteAccount = trpc.auth.deleteAccount.useMutation();
  const { logout } = useAuth({ autoFetch: false });
  const router = useRouter();

  async function runDeleteAccount(): Promise<void> {
    // Server first: if the purge fails we keep local data and surface the error,
    // rather than wiping the device while the server copy survives.
    await deleteAccount.mutateAsync();
    try {
      await clearLocalData?.();
    } catch {
      // Local cleanup is best-effort — the account is already gone server-side.
    }
    await logout();
    router.replace('/login');
  }

  return { runDeleteAccount, isDeleting: deleteAccount.isPending };
}
