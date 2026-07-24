Component({
  properties: {
    recipe: { type: Object, value: null }
  },
  methods: {
    openRecipe() {
      if (!this.properties.recipe?.id) return;
      this.triggerEvent("select", { recipeId: this.properties.recipe.id });
    }
  }
});
