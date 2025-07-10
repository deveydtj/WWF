describe('Smoke', () => {
  it('loads the landing page', () => {
    cy.visit('/');
    cy.contains('WordSquad');
  });
});
