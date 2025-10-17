const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(116.39, 39.91, 200),
    name: "北京故宫", // 实体的名称
    label: {
        text: "北京故宫",
        font: "24px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.TOP,  // 修改为TOP，使文字从顶部开始
        pixelOffset: new Cesium.Cartesian2(0, -30)  // 向下偏移文字，使其在billboard下方
    },
    billboard: {
        image: "./商店-01.png",
        width: 50,
        height: 50,
        scale: 0.5,
        verticalOrigin: Cesium.VerticalOrigin.TOP, // 修改为BOTTOM，使广告牌底部对齐位置
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1000) // 0米到1000米内可见
    },
});
viewer.zoomTo(entity);