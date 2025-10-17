// Cesium智能路径规划系统
// 配置Cesium Ion访问令牌
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxOTkyNDQxMi00ZmVmLTRmNmItODY3OS04YTAyMDRkZWM5ZmIiLCJpZCI6MTUxMzE1LCJpYXQiOjE2ODg0NjgyMjN9.vnG23heAtCtjdz2BthH-RVSs9Rl0-vC3MHWuHFYUuGE';

// 全局变量
let viewer;
let deliveryPoints = [];
let pathEntity;
let lastCalculateTime = 0;
const RECALCULATE_INTERVAL = 1000; // 1秒内只计算一次
let debugMode = false;

// 初始化Cesium场景
async function initCesium() {
    const terrainProvider = await Cesium.createWorldTerrainAsync();
    viewer = new Cesium.Viewer('cesiumContainer', {
        timeline: false,
        animation: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false
    });

    // 设置初始视角（定位到中国区域）
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 10000000)
    });

    // 初始化配送点数据
    initializeDeliveryPoints();
    
    // 创建路径可视化
    createPathVisualization();
    
    // 添加交互功能
    setupInteractions();
    
    // 更新统计信息
    updateStats();
    
    console.log('Cesium智能路径规划系统初始化完成！');
}

// 初始化配送点数据
function initializeDeliveryPoints() {
    deliveryPoints = [
        {
            name: '中央仓库',
            position: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 0),
            type: 'warehouse'
        },
        {
            name: '客户A - 朝阳区',
            position: Cesium.Cartesian3.fromDegrees(116.5, 39.9, 0),
            type: 'customer'
        },
        {
            name: '客户B - 海淀区', 
            position: Cesium.Cartesian3.fromDegrees(116.3, 39.9, 0),
            type: 'customer'
        },
        {
            name: '客户C - 通州区',
            position: Cesium.Cartesian3.fromDegrees(116.6, 39.9, 0),
            type: 'customer'
        }
    ];

    // 创建实体可视化
    createDeliveryPointEntities();
}

// 创建配送点实体
function createDeliveryPointEntities() {
    deliveryPoints.forEach((point, index) => {
        const entity = viewer.entities.add({
            name: point.name,
            position: point.position,
            point: {
                pixelSize: point.type === 'warehouse' ? 15 : 10,
                color: point.type === 'warehouse' ? Cesium.Color.RED : Cesium.Color.BLUE,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2
            },
            label: {
                text: point.name,
                font: '14px sans-serif',
                pixelOffset: new Cesium.Cartesian2(0, -30),
                fillColor: Cesium.Color.WHITE,
                backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
                showBackground: true
            },
            description: `
                <div style="padding: 10px; background: white; border-radius: 5px;">
                    <h4>${point.name}</h4>
                    <p><strong>类型:</strong> ${point.type === 'warehouse' ? '仓库' : '客户'}</p>
                    <p><strong>坐标:</strong> ${Cesium.Cartographic.fromCartesian(point.position).longitude.toFixed(4)}, ${Cesium.Cartographic.fromCartesian(point.position).latitude.toFixed(4)}</p>
                </div>
            `
        });
        
        // 保存实体引用，便于后续操作
        point.entity = entity;
    });
}

// 计算两点之间的距离（米）
function calculateDistance(pos1, pos2) {
    return Cesium.Cartesian3.distance(pos1, pos2);
}

// 计算路径总长度
function calculatePathTotalLength(positions) {
    if (!positions || positions.length < 2) {
        return 0;
    }
    
    let totalDistance = 0;
    for (let i = 1; i < positions.length; i++) {
        totalDistance += calculateDistance(positions[i-1], positions[i]);
    }
    return totalDistance;
}

// 2-opt算法优化路径
function optimizeWith2Opt(path) {
    if (path.length <= 3) return path;
    
    let improvement = true;
    let bestPath = [...path];
    let bestDistance = calculatePathTotalLength(path);
    
    while (improvement) {
        improvement = false;
        
        for (let i = 1; i < path.length - 2; i++) {
            for (let j = i + 1; j < path.length - 1; j++) {
                // 尝试交换路径段
                const newPath = [...bestPath];
                // 反转 i 到 j 之间的路径段
                const reversedSegment = newPath.slice(i, j + 1).reverse();
                for (let k = 0; k < reversedSegment.length; k++) {
                    newPath[i + k] = reversedSegment[k];
                }
                
                const newDistance = calculatePathTotalLength(newPath);
                
                if (newDistance < bestDistance) {
                    bestPath = newPath;
                    bestDistance = newDistance;
                    improvement = true;
                }
            }
        }
    }
    
    return bestPath;
}

// 改进的路径规划算法（最近邻 + 2-opt优化）- 不回仓库
function calculateDeliveryPath(points) {
    const warehouse = points.find(p => p.type === 'warehouse');
    const customers = points.filter(p => p.type === 'customer');
    
    if (!warehouse || customers.length === 0) {
        return [];
    }
    
    // 最近邻算法构建初始路径
    let unvisited = [...customers];
    let currentPoint = warehouse;
    let path = [warehouse.position];
    
    while (unvisited.length > 0) {
        // 找到距离当前点最近的未访问客户
        let nearestIndex = 0;
        let minDistance = calculateDistance(currentPoint.position, unvisited[0].position);
        
        for (let i = 1; i < unvisited.length; i++) {
            const distance = calculateDistance(currentPoint.position, unvisited[i].position);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = i;
            }
        }
        
        const nearestPoint = unvisited[nearestIndex];
        path.push(nearestPoint.position);
        currentPoint = nearestPoint;
        unvisited.splice(nearestIndex, 1);
    }
    
    // 不返回仓库，路径在最后一个客户点结束
    // path.push(warehouse.position); // 注释掉返回仓库的代码
    
    // 应用2-opt优化
    if (path.length > 3) {
        path = optimizeWith2Opt(path);
    }
    
    return path;
}

// 优化路径计算（限制频率）
function optimizePathCalculation() {
    const now = Date.now();
    if (now - lastCalculateTime > RECALCULATE_INTERVAL) {
        lastCalculateTime = now;
        return calculateDeliveryPath(deliveryPoints);
    }
    return null; // 返回null时不更新
}

// 创建路径可视化
function createPathVisualization() {
    pathEntity = viewer.entities.add({
        name: '配送路径',
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const positions = optimizePathCalculation();
                return positions || calculateDeliveryPath(deliveryPoints);
            }, false),
            width: 8,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.YELLOW
            }),
            clampToGround: true
        }
    });
}

// 计算路径总长度（公里）
function calculatePathLength(positions) {
    const totalDistance = calculatePathTotalLength(positions);
    return (totalDistance / 1000).toFixed(2); // 转换为公里
}

// 设置交互功能
function setupInteractions() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // 鼠标悬停显示路径信息
    handler.setInputAction(event => {
        const picked = viewer.scene.pick(event.endPosition);
        
        if (picked && picked.id === pathEntity) {
            // 高亮路径
            pathEntity.polyline.width = new Cesium.ConstantProperty(12);
            
            // 显示路径信息
            const positions = calculateDeliveryPath(deliveryPoints);
            const distance = calculatePathLength(positions);
            
            pathEntity.description = new Cesium.ConstantProperty(`
                <div style="padding: 15px; background: rgba(42, 42, 42, 0.95); color: white; border-radius: 5px; border: 1px solid #666;">
                    <h3 style="margin: 0 0 10px 0; color: #48b6ff;">🚚 配送路径信息</h3>
                    <p style="margin: 5px 0;"><strong>总站点数:</strong> ${deliveryPoints.length} 个</p>
                    <p style="margin: 5px 0;"><strong>配送总长:</strong> ${distance} 公里</p>
                    <p style="margin: 5px 0;"><strong>预计耗时:</strong> ${(distance / 60).toFixed(1)} 小时</p>
                    <p style="margin: 5px 0;"><strong>路径模式:</strong> 单程配送（不回仓库）</p>
                </div>
            `);
        } else {
            // 恢复原样
            pathEntity.polyline.width = new Cesium.ConstantProperty(8);
            pathEntity.description = undefined;
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 点击获取坐标
    handler.setInputAction(event => {
        const ray = viewer.camera.getPickRay(event.position);
        const position = viewer.scene.globe.pick(ray, viewer.scene);
        if (position) {
            const cartographic = Cesium.Cartographic.fromCartesian(position);
            const longitude = Cesium.Math.toDegrees(cartographic.longitude);
            const latitude = Cesium.Math.toDegrees(cartographic.latitude);
            
            // 填充坐标到输入框
            document.getElementById('pointLon').value = longitude.toFixed(6);
            document.getElementById('pointLat').value = latitude.toFixed(6);
            
            // 添加点击动画效果
            const clickEffect = viewer.entities.add({
                position: position,
                point: {
                    pixelSize: 20,
                    color: Cesium.Color.YELLOW.withAlpha(0.8),
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                }
            });
            
            // 1秒后移除点击效果
            setTimeout(() => {
                viewer.entities.remove(clickEffect);
            }, 1000);
            
            // 显示坐标已填充提示
            showNotification(`📍 已填充坐标: ${longitude.toFixed(4)}, ${latitude.toFixed(4)}`, 'info');
            
            console.log(`点击位置坐标: ${longitude.toFixed(6)}, ${latitude.toFixed(6)}`);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// 添加新的配送点
function addNewDeliveryPoint(longitude, latitude, name) {
    const newPoint = {
        name: name,
        position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
        type: 'customer'
    };
    
    deliveryPoints.push(newPoint);
    
    // 可视化新点
    const entity = viewer.entities.add({
        name: newPoint.name,
        position: newPoint.position,
        point: {
            pixelSize: 10,
            color: Cesium.Color.GREEN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2
        },
        label: {
            text: newPoint.name,
            font: '14px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -30),
            fillColor: Cesium.Color.WHITE,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
            showBackground: true
        },
        description: `
            <div style="padding: 10px; background: white; border-radius: 5px;">
                <h4>${newPoint.name}</h4>
                <p><strong>类型:</strong> 客户</p>
                <p><strong>坐标:</strong> ${longitude.toFixed(4)}, ${latitude.toFixed(4)}</p>
            </div>
        `
    });
    
    newPoint.entity = entity;
    
    // 强制更新路径
    lastCalculateTime = 0;
    updateStats();
    
    // 显示添加成功提示
    showNotification(`✅ 成功添加配送点: ${name}`, 'success');
    
    console.log(`添加新配送点: ${name} (${longitude.toFixed(4)}, ${latitude.toFixed(4)})`);
    return newPoint;
}

// 更新统计信息
function updateStats() {
    const positions = calculateDeliveryPath(deliveryPoints);
    const distance = calculatePathLength(positions);
    
    document.getElementById('totalPoints').textContent = `总站点数: ${deliveryPoints.length}`;
    document.getElementById('totalDistance').textContent = `配送总长: ${distance} km`;
    document.getElementById('estimatedTime').textContent = `预计耗时: ${(distance / 60).toFixed(1)} 小时`;
}

// 清空所有配送点
function clearAllPoints() {
    // 移除所有实体
    deliveryPoints.forEach(point => {
        if (point.entity) {
            viewer.entities.remove(point.entity);
        }
    });
    
    // 重置数据
    deliveryPoints = [];
    
    // 重新添加仓库
    const warehouse = {
        name: '中央仓库',
        position: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 0),
        type: 'warehouse'
    };
    
    deliveryPoints.push(warehouse);
    
    const entity = viewer.entities.add({
        name: warehouse.name,
        position: warehouse.position,
        point: {
            pixelSize: 15,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2
        },
        label: {
            text: warehouse.name,
            font: '14px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -30),
            fillColor: Cesium.Color.WHITE,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
            showBackground: true
        }
    });
    
    warehouse.entity = entity;
    
    updateStats();
    console.log('已清空所有配送点，仅保留中央仓库');
}

// 切换调试模式
function toggleDebugMode() {
    debugMode = !debugMode;
    
    if (debugMode) {
        // 开启调试功能
        viewer.scene.debugShowFramesPerSecond = true;
        viewer.scene.globe.show = true;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        console.log('调试模式已开启 - 显示FPS和地形');
        
        // 显示调试状态提示
        showNotification('调试模式已开启', 'info');
    } else {
        // 关闭调试功能
        viewer.scene.debugShowFramesPerSecond = false;
        console.log('调试模式已关闭');
        
        // 显示调试状态提示
        showNotification('调试模式已关闭', 'info');
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    let bgColor;
    
    switch(type) {
        case 'error':
            bgColor = 'rgba(244, 67, 54, 0.9)';
            break;
        case 'success':
            bgColor = 'rgba(76, 175, 80, 0.9)';
            break;
        default:
            bgColor = 'rgba(33, 150, 243, 0.9)';
    }
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${bgColor};
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 10000;
        font-family: 'Microsoft YaHei', sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3秒后移除提示
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initCesium();
        console.log('Cesium 初始化成功');
    } catch (error) {
        console.error('Cesium 初始化失败:', error);
        alert('Cesium 初始化失败，请检查网络连接或刷新页面重试');
    }
});

// 导出函数供HTML调用
window.addNewDeliveryPointFromForm = function() {
    const lon = parseFloat(document.getElementById('pointLon').value);
    const lat = parseFloat(document.getElementById('pointLat').value);
    const name = document.getElementById('pointName').value;
    
    if (isNaN(lon) || isNaN(lat)) {
        alert('请输入有效的经纬度坐标！');
        return;
    }
    
    addNewDeliveryPoint(lon, lat, name);
    
    // 重置表单
    document.getElementById('pointName').value = '新客户';
    document.getElementById('pointLon').value = '116.45';
    document.getElementById('pointLat').value = '39.95';
};

window.clearAllPoints = clearAllPoints;
window.toggleDebugMode = toggleDebugMode;