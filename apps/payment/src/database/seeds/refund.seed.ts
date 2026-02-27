
class CreateRefunds {
  async run(_dataSource) {
    const refunds = [
      {
        paymentId: 'a0000001-0001-4000-8000-000000000002',
        amount: 12.99,
        reason: 'Customer requested return',
        status: 'COMPLETED',
      },
      {
        paymentId: 'a0000001-0001-4000-8000-000000000002',
        amount: 12.99,
        reason: 'Customer requested return',
        status: 'COMPLETED',
      },
    ];

    return refunds;
  }
}

module.exports = CreateRefunds;