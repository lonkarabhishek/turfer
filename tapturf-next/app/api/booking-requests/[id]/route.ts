import { deleteBookingRequest } from "@/lib/booking/server";

// One booking request (lib/booking/server.ts).

type Ctx = { params: Promise<{ id: string }> };

/** The player cancels their own request, waiting or confirmed, before it starts. Nothing is deleted: it is kept as cancelled. */
export async function DELETE(req: Request, { params }: Ctx) {
  return deleteBookingRequest(req, (await params).id);
}
