import { getAuth } from "@/lib/auth";

async function handle(req: Request) {
  return (await getAuth()).handler(req);
}

export { handle as GET, handle as POST };
