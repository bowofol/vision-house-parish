/* Official accounts supplied by the church for this Giving page.
 * Keep accountNumber as a quoted string so leading zeroes are preserved.
 * Each account is bound to its own card by id. No payment processing is included.
 */
window.VisionHouseData = window.VisionHouseData || {};
window.VisionHouseData.giving = {
  accounts: [
    {
      id: 'tithe', verified: true, title: 'Tithe Account', purpose: 'Tithes',
      bankName: 'Guaranty Trust Bank (GTBank)',
      accountName: 'RCCG VISION HOUSE PARISH',
      accountNumber: '0138942426'
    },
    {
      id: 'project', verified: true, title: 'Project Account', purpose: 'Church Building Project',
      featuredMessage: "Let's Help Build the House of God",
      bankName: 'First Bank',
      accountName: 'RCCG VISION HOUSE PARISH',
      accountNumber: '2035906872'
    }
  ]
};
