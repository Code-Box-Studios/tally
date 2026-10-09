import { useQuery } from "@tanstack/react-query";
import type { Collection } from "../core/domain/records";
import { useSession } from "../features/auth/session-provider";
export function useRecords(collection: Collection) {
  const { repo, profile } = useSession();
  return useQuery({
    queryKey: [repo?.namespace, repo?.owner, collection],
    queryFn: () => repo!.records(collection),
    enabled: !!repo && !!profile,
    refetchInterval: 15000,
  });
}
