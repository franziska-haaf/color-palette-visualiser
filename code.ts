/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__);
figma.ui.resize(800, 600)

class ColorVariable {
  name: string;
  id: string;
  constructor(theName: string, theId: string) {
    this.name = theName;
    this.id = theId;
  }
}

class MyColorPalette {
  name: string;
  colors: ColorVariable[] = [];

  constructor(theName: string, theColors: ColorVariable[]) {
    this.name = theName;
    this.colors = theColors;
  }
}


(async () => {
  // Load the local variable collections
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();

  // Send the available list to the UI todo use this
  let localCollectionsFormatted = [{}]
  localCollections.forEach(collection => {
    localCollectionsFormatted.push({ name: collection.name, id: collection.id })
  })
  // Keep both keys for compatibility with existing UI code.
  figma.ui.postMessage({
    localCollections: localCollectionsFormatted,
    localCollectionsFormatted,
  });

  // todo for testing purposes only first collection is loaded
  const firstCollection = localCollections[0];

  const colorPalettesOfCollection: MyColorPalette[] = [];

  for (let variableId of firstCollection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId);

    // If it's a color, check for an existing group or create one and add it either way.
    if (variable?.resolvedType === 'COLOR') {
      const variableNameHierarchy = variable.name.split('/');
      const paletteName = variableNameHierarchy.length > 1
        ? variableNameHierarchy[variableNameHierarchy.length - 2]
        : 'Ungrouped'; // If no variable grouping exists

      // Check if a palette with this name already exists. 
      let existingColorPalette = colorPalettesOfCollection.find(palette => palette.name === paletteName);

      if (!existingColorPalette) {
        existingColorPalette = new MyColorPalette(paletteName, []);
        colorPalettesOfCollection.push(existingColorPalette);
      }

      existingColorPalette.colors.push(new ColorVariable(variableNameHierarchy[variableNameHierarchy.length - 1], variable.id));
    }
  }

  console.log('colorPalettesOfCollection', colorPalettesOfCollection);
  // Keep both keys for compatibility with existing UI code.
  figma.ui.postMessage({

    colorPalettesOfCollection: colorPalettesOfCollection,
  });

  // Create a palette for the given palette
  figma.ui.onmessage = (msg) => {
    // Support both old and new UI payload formats.
    if (msg.type === 'create-palette') {
      const paletteName = msg.palette ?? msg.paletteName;
      console.log('Creating palette for', paletteName);
      createPalette(paletteName);
    }
  }

  async function createPalette(paletteName: string) {
    const dimensionLarge = 16;
    const dimensionMedium = 8;
    const dimensionSmall = 4;
    const boldFont = { family: "Inter", style: "Bold" };
    await figma.loadFontAsync(boldFont);
    const regularFont = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(regularFont);
    const textColor = { r: 0, g: 0, b: 0 };

    const colorPalette = colorPalettesOfCollection.find(palette => palette.name === paletteName);

    if (colorPalette) {

      // Create a frame named {paletteName}
      let paletteFrame = figma.createFrame()
      paletteFrame.name = colorPalette.name
      paletteFrame.layoutMode = 'VERTICAL'
      paletteFrame.paddingLeft =
        paletteFrame.paddingRight =
        paletteFrame.paddingTop =
        paletteFrame.paddingBottom =
        dimensionLarge;
      paletteFrame.layoutSizingHorizontal = 'HUG'

      // Create a text with the {paletteName}
      let paletteNameText = figma.createText()
      paletteFrame.appendChild(paletteNameText) // Place in frame
      paletteNameText.fontName = boldFont;
      paletteNameText.fills = [{ type: "SOLID", color: textColor }]
      paletteNameText.name = "Palette Name"
      paletteNameText.characters = colorPalette.name
      paletteNameText.layoutAlign = 'STRETCH'

      // Add a frame named "Colors"
      let colorsFrame = figma.createFrame()
       paletteFrame.appendChild(colorsFrame) // Place in frame
      colorsFrame.name = "Colors"
      colorsFrame.layoutMode = 'HORIZONTAL'
      colorsFrame.itemSpacing = dimensionSmall

      /**
       * Add each color
       * color = { name: "100", id: "VariableID:1234:123" }
       */
      colorPalette.colors.forEach(async (color) => {
        // Create a wrapper
        let colorWrapper = figma.createFrame()
        colorsFrame.appendChild(colorWrapper) // Place in colors frame
        colorWrapper.name = "Color Wrapper"
        colorWrapper.layoutMode = 'VERTICAL'
        colorWrapper.layoutSizingHorizontal = 'HUG'
        colorWrapper.paddingLeft =
          colorWrapper.paddingRight =
          colorWrapper.paddingTop =
          colorWrapper.paddingBottom =
          dimensionSmall;
        //todo add border

        // Add the name of the color. E.g. "100", "200" etc.
        let colorValueText = figma.createText()
        colorWrapper.appendChild(colorValueText) // Place in color wrapper
        colorValueText.fontName = regularFont;
        colorValueText.name = "Color Name"
        colorValueText.characters = color.name
        colorValueText.fills = [{ type: "SOLID", color: textColor }]
        colorValueText.layoutAlign = 'STRETCH'
        colorWrapper.appendChild(colorValueText)

        // Create a frame to be filled with the color
        let colorFrame = figma.createFrame()
        colorWrapper.appendChild(colorFrame) // Place in color wrapper
        colorFrame.name = "Color"
        colorFrame.resize(100, 100)
        colorFrame.bottomLeftRadius =
          colorFrame.bottomRightRadius =
          colorFrame.topLeftRadius =
          colorFrame.topRightRadius =
          dimensionMedium;
        // Load the variable for the color id
        const fillColorVariable = await figma.variables.getVariableByIdAsync(color.id);
        // Fills are immutable, so copy the array before rebinding paint variables.
        if (fillColorVariable && Array.isArray(colorFrame.fills) && colorFrame.fills.length > 0) {
          const fillsCopy = colorFrame.fills.slice();
          fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', fillColorVariable);
          colorFrame.fills = fillsCopy;
        }
      })

    }

    // Fills and strokes must be set via their immutable arrays
    // node.setBoundVariable('width', widthVariable)
    // const fillsCopy = clone(node.fills)
    // fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', colorVariable)
    // node.fills = fillsCopy

  }
})();


