import torch 
import torch.nn as nn
import torchvision.transforms as transforms
from torchvision import models
from PIL import Image

CLASSES = [ 
    'AnnualCrop', 'Forest', 'HerbaceousVegetation', 'Highway', 
    'Industrial', 'Pasture', 'PermanentCrop', 'Residential', 'River', 'SeaLake'
]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = models.resnet18()
model.fc = nn.Linear(model.fc.in_features, 10)

model.load_state_dict(torch.load("eurosat_resnet18.pth", map_location=device))
model.eval()

transform = transforms.Compose([
    transforms.Resize((64,64)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def verify_farmland(image_path):
    img = Image.open(image_path).convert('RGB')
    img_tensor = transform(img).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(img_tensor)
        _, pred = torch.max(output,1)

    predicted_class = CLASSES[pred.item()]
    is_valid = predicted_class in ['AnnualCrop', 'PermanentCrop']

    return predicted_class, is_valid