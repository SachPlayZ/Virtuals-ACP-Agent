declare module "colorthief" {
    type Color = [number, number, number];

    interface ColorThief {
        getColor(imagePath: string, quality?: number): Promise<Color>;
        getPalette(
            imagePath: string,
            colorCount?: number,
            quality?: number
        ): Promise<Color[]>;
    }

    const colorThief: ColorThief;
    export default colorThief;
}
