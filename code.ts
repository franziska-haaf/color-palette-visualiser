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

      existingColorPalette.colors.push(new ColorVariable(variable.name, variable.id));
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
      //createPalette(paletteName);
    }
  }

})();


/* 

function createPalette(colorPalette) {
    debugger;
    // Create a frame named {paletteName}
    let paletteFrame = figma.createFrame()
    paletteFrame.name = colorPalette.name

    // Create a text with the {paletteName}
    let paletteNameText = figma.createText()
    paletteNameText.characters = colorPalette.name

    // Add a frame named "Colors"
    let colorsFrame = figma.createFrame()
    colorsFrame.name = "Colors"

    // Add a frame "Color Wrapper" for each color
    colorPalette.colors.forEach(async (color) => { // todo check was hier tatsächlich ankommt
      debugger;
      let colorWrapper = figma.createFrame()
      colorWrapper.name = "Color Wrapper"

      // Add the name of the color. E.g. "100", "200" etc.
      let colorValueText = figma.createText()
      colorValueText.characters = color.name
      colorWrapper.appendChild(colorValueText)

      // Create a frame to be filled with the color
      let colorFrame = figma.createFrame()
      colorFrame.name = "Color"
      // Load the variable for the color id
      const fillColorVariable = await figma.variables.getVariableByIdAsync(color.id);
      // Set it as a fill. This complicated construct is from the Figma doc
      const fillsCopy = clone(colorFrame.fills)
      fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', fillColorVariable)
      colorFrame.fills = fillsCopy
      colorWrapper.appendChild(colorFrame)

      colorsFrame.appendChild(colorWrapper)
    })


    // Fills and strokes must be set via their immutable arrays
    // node.setBoundVariable('width', widthVariable)
    // const fillsCopy = clone(node.fills)
    // fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', colorVariable)
    // node.fills = fillsCopy

  } */