// "Dr. Anna Muster" / "Prof. Dr. Anna Muster": the name pages show for a
// doctor. Lives apart from BookingDialog so lists can show names without
// downloading the booking dialog (and its date picker) up front.
export const doctorDisplayName = (d: { title?: string | null; full_name: string }) =>
  `${d.title ? d.title : 'Dr.'} ${d.full_name}`;
